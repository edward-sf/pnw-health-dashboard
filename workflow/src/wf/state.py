"""Run state: one JSON file per milestone run, written only by wf."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

from wf.config import Graph

NodeStatus = Literal["pending", "running", "done", "failed", "escalated"]
_STATUSES: tuple[str, ...] = ("pending", "running", "done", "failed", "escalated")


class RunStateError(Exception):
    """Run state is missing, unreadable or an operation on it is not allowed."""


class BudgetExhausted(RunStateError):
    """A node has used all of its rounds."""


@dataclass
class NodeRecord:
    status: NodeStatus = "pending"
    rounds: int = 0
    started_at: str | None = None
    finished_at: str | None = None
    note: str | None = None


@dataclass
class GateRecord:
    task: str
    sha: str
    checks: dict[str, bool]
    passed: bool
    at: str


@dataclass
class ReviewRecord:
    task: str
    sha: str
    node: str
    result: Literal["pass", "findings"]
    verdict_path: str
    at: str


@dataclass
class UsageSample:
    node: str
    kind: str
    steps: int
    pct_before: float | None
    pct_after: float | None
    tokens: int | None


@dataclass
class Escalation:
    node: str
    reason: str
    at: str


@dataclass
class RunState:
    milestone: int
    nodes: dict[str, NodeRecord]
    gates: list[GateRecord] = field(default_factory=list)
    reviews: list[ReviewRecord] = field(default_factory=list)
    usage: list[UsageSample] = field(default_factory=list)
    escalations: list[Escalation] = field(default_factory=list)
    window: str | None = None
    task_graph: str = ""


def run_dir(root: Path, milestone: int) -> Path:
    return root / ".workflow/runs" / f"m{milestone}"


def _state_path(root: Path, milestone: int) -> Path:
    return run_dir(root, milestone) / "state.json"


def init_run(
    root: Path, milestone: int, graph: Graph, task_ids: list[str], task_graph: str = ""
) -> RunState:
    path = _state_path(root, milestone)
    if path.exists():
        raise RunStateError(f"run state already exists: {path}")
    nodes: dict[str, NodeRecord] = {}
    for spec in graph.nodes.values():
        if spec.per_task:
            for task in task_ids:
                nodes[f"{task}.{spec.name}"] = NodeRecord()
        else:
            nodes[spec.name] = NodeRecord()
    state = RunState(milestone=milestone, nodes=nodes, task_graph=task_graph)
    save(root, state)
    return state


def _check(cond: bool) -> None:
    if not cond:
        raise ValueError("bad shape")


def _opt(value: Any, kind: type | tuple[type, ...]) -> None:
    _check(value is None or (isinstance(value, kind) and not isinstance(value, bool)))


def _node(raw: Any) -> NodeRecord:
    _check(isinstance(raw, dict) and raw.get("status") in _STATUSES)
    _check(isinstance(raw.get("rounds"), int) and not isinstance(raw["rounds"], bool))
    for key in ("started_at", "finished_at", "note"):
        _check(raw.get(key) is None or isinstance(raw[key], str))
    return NodeRecord(
        raw["status"], raw["rounds"], raw["started_at"], raw["finished_at"], raw["note"]
    )


def _gate(raw: Any) -> GateRecord:
    _check(isinstance(raw, dict) and isinstance(raw.get("checks"), dict))
    _check(all(isinstance(k, str) and isinstance(v, bool) for k, v in raw["checks"].items()))
    _check(all(isinstance(raw.get(k), str) for k in ("task", "sha", "at")))
    _check(isinstance(raw.get("passed"), bool))
    return GateRecord(raw["task"], raw["sha"], raw["checks"], raw["passed"], raw["at"])


def _review(raw: Any) -> ReviewRecord:
    _check(isinstance(raw, dict) and raw.get("result") in ("pass", "findings"))
    _check(all(isinstance(raw.get(k), str) for k in ("task", "sha", "node", "verdict_path", "at")))
    return ReviewRecord(
        raw["task"], raw["sha"], raw["node"], raw["result"], raw["verdict_path"], raw["at"]
    )


def _usage(raw: Any) -> UsageSample:
    _check(isinstance(raw, dict))
    _check(all(isinstance(raw.get(k), str) for k in ("node", "kind")))
    _check(isinstance(raw.get("steps"), int))
    _opt(raw.get("pct_before"), (int, float))
    _opt(raw.get("pct_after"), (int, float))
    _opt(raw.get("tokens"), int)
    return UsageSample(
        raw["node"], raw["kind"], raw["steps"], raw["pct_before"], raw["pct_after"], raw["tokens"]
    )


def _escalation(raw: Any) -> Escalation:
    _check(isinstance(raw, dict))
    _check(all(isinstance(raw.get(k), str) for k in ("node", "reason", "at")))
    return Escalation(raw["node"], raw["reason"], raw["at"])


def _parse(raw: Any) -> RunState:
    _check(isinstance(raw, dict))
    _check(isinstance(raw.get("milestone"), int) and not isinstance(raw["milestone"], bool))
    _check(isinstance(raw.get("nodes"), dict))
    _check(raw.get("window") is None or isinstance(raw["window"], str))
    _check(isinstance(raw.get("task_graph"), str))
    lists = {k: raw.get(k) for k in ("gates", "reviews", "usage", "escalations")}
    _check(all(isinstance(v, list) for v in lists.values()))
    return RunState(
        milestone=raw["milestone"],
        nodes={str(k): _node(v) for k, v in raw["nodes"].items()},
        gates=[_gate(g) for g in lists["gates"] or []],
        reviews=[_review(r) for r in lists["reviews"] or []],
        usage=[_usage(u) for u in lists["usage"] or []],
        escalations=[_escalation(e) for e in lists["escalations"] or []],
        window=raw["window"],
        task_graph=raw["task_graph"],
    )


def load(root: Path, milestone: int) -> RunState:
    path = _state_path(root, milestone)
    if not path.exists():
        raise RunStateError(f"no run state for milestone {milestone}: {path}")
    try:
        return _parse(json.loads(path.read_text()))
    except (ValueError, OSError, KeyError, TypeError) as e:
        raise RunStateError(f"run state unreadable: {path}") from e


def save(root: Path, state: RunState) -> None:
    path = _state_path(root, state.milestone)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(asdict(state), indent=2) + "\n")
    os.replace(tmp, path)


def _record(state: RunState, node: str) -> NodeRecord:
    try:
        return state.nodes[node]
    except KeyError:
        raise RunStateError(f"unknown node '{node}'") from None


def escalate(state: RunState, node: str, reason: str, now: str) -> None:
    rec = _record(state, node)
    rec.status = "escalated"
    rec.finished_at = now
    state.escalations.append(Escalation(node, reason, now))


def start_round(state: RunState, node: str, budget: int | None, now: str) -> None:
    rec = _record(state, node)
    if budget is not None and rec.rounds >= budget:
        escalate(state, node, f"budget of {budget} rounds exhausted", now)
        raise BudgetExhausted(f"{node}: budget of {budget} rounds exhausted")
    rec.rounds += 1
    rec.status = "running"
    rec.started_at = now
    rec.finished_at = None


def finish(
    state: RunState, node: str, status: NodeStatus, now: str, note: str | None = None
) -> None:
    rec = _record(state, node)
    rec.status = status
    rec.finished_at = now
    rec.note = note


def resume(state: RunState, node: str, now: str) -> None:
    """Return an interrupted node to pending without spending a round."""
    rec = _record(state, node)
    if rec.status != "running":
        raise RunStateError(f"{node} is not running (status {rec.status})")
    rec.status = "pending"
    rec.started_at = None
    rec.note = f"interrupted, resumed at {now}"


def latest_gate(state: RunState, task: str, sha: str) -> GateRecord | None:
    for gate in reversed(state.gates):
        if gate.task == task and gate.sha == sha:
            return gate
    return None


def latest_review(state: RunState, task: str, sha: str) -> ReviewRecord | None:
    for review in reversed(state.reviews):
        if review.task == task and review.sha == sha:
            return review
    return None
