"""Scheduler: which node runs next, given readiness, usage estimates and window fit (spec 5.8)."""

from __future__ import annotations

import json
import statistics
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from wf.config import ConfigError, Graph, Pacing
from wf.state import Escalation, RunState, RunStateError

# ---------------------------------------------------------------- usage


@dataclass(frozen=True)
class Window:
    pct_used: float
    resets_at: str


@dataclass(frozen=True)
class Usage:
    five_hour: Window | None
    weekly: Window | None


_LABELS = {"five_hour": "5-hour limit", "weekly": "Weekly · all models"}


def _window(raw: Any) -> Window | None:
    if not isinstance(raw, dict):
        return None
    pct = raw.get("percentUsed")
    resets = raw.get("resetsAt")
    if isinstance(pct, bool) or not isinstance(pct, (int, float)) or not isinstance(resets, str):
        return None
    return Window(float(pct), resets)


def parse_usage(get_usage_json: dict[str, Any]) -> Usage:
    """Read the 5-hour and weekly windows; anything but status "ok" means unavailable."""
    plan = get_usage_json.get("plan")
    plan = plan if isinstance(plan, dict) else {}
    status = plan.get("status")
    if status != "ok":
        return Usage(None, None)
    windows = plan.get("windows")
    found: dict[str, Window | None] = {"five_hour": None, "weekly": None}
    for raw in windows if isinstance(windows, list) else []:
        if not isinstance(raw, dict):
            continue
        for key, label in _LABELS.items():
            if raw.get("label") == label:
                found[key] = _window(raw)
    return Usage(found["five_hour"], found["weekly"])


# ---------------------------------------------------------------- task graph file


@dataclass(frozen=True)
class TaskInfo:
    id: str
    steps: int
    depends_on: tuple[str, ...]


@dataclass(frozen=True)
class TaskNode:
    id: str
    issue: int | None
    title: str
    steps: int
    depends_on: tuple[str, ...]
    blocks: tuple[str, ...]
    files: tuple[str, ...]
    labels: tuple[str, ...]
    branch: str | None


@dataclass(frozen=True)
class TaskGraph:
    milestone: int
    plan: str
    spec: str
    plan_sha: str
    order: tuple[str, ...]
    tasks: dict[str, TaskNode]

    def infos(self) -> list[TaskInfo]:
        return [TaskInfo(t.id, t.steps, t.depends_on) for t in (self.tasks[i] for i in self.order)]


def write_task_graph(path: Path, graph: TaskGraph) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(graph), indent=2, sort_keys=True) + "\n")


def _task_node(raw: Any) -> TaskNode:
    if not isinstance(raw, dict):
        raise ValueError("task must be an object")
    return TaskNode(
        id=raw["id"],
        issue=raw["issue"],
        title=raw["title"],
        steps=int(raw["steps"]),
        depends_on=tuple(raw["depends_on"]),
        blocks=tuple(raw["blocks"]),
        files=tuple(raw["files"]),
        labels=tuple(raw["labels"]),
        branch=raw["branch"],
    )


def load_task_graph(path: Path) -> TaskGraph:
    try:
        raw = json.loads(path.read_text())
        tasks = {str(k): _task_node(v) for k, v in raw["tasks"].items()}
        order = tuple(raw["order"])
        if set(order) != set(tasks):
            raise ValueError("order and tasks disagree")
        return TaskGraph(
            milestone=int(raw["milestone"]),
            plan=raw["plan"],
            spec=raw["spec"],
            plan_sha=raw["plan_sha"],
            order=order,
            tasks=tasks,
        )
    except OSError as e:
        raise ConfigError(f"cannot read task graph {path}: {e.strerror}") from e
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        raise ConfigError(f"task graph unreadable: {path}") from e


# ---------------------------------------------------------------- readiness


def _split(node: str) -> tuple[str | None, str]:
    task, dot, name = node.rpartition(".")
    return (task, name) if dot else (None, name)


def plan_order(graph: Graph, tasks: list[TaskInfo]) -> list[str]:
    """Task order, then node order within a task, then the milestone nodes."""
    per_task = [s.name for s in graph.nodes.values() if s.per_task]
    milestone = [s.name for s in graph.nodes.values() if not s.per_task]
    return [f"{t.id}.{n}" for t in tasks for n in per_task] + milestone


def ready_nodes(state: RunState, graph: Graph, tasks: list[TaskInfo]) -> list[str]:
    by_id = {t.id: t for t in tasks}

    def done(node: str) -> bool:
        rec = state.nodes.get(node)
        return rec is not None and rec.status == "done"

    def predecessors_done(task: str | None, name: str) -> bool:
        spec = graph.nodes[name]
        if task is not None and not spec.after:  # first node of a task: wait on dependencies
            return all(done(f"{d}.deploy-watch") for d in by_id[task].depends_on)
        for after in spec.after:
            if graph.nodes[after].per_task:
                targets = (
                    [f"{task}.{after}"] if task is not None else [f"{t.id}.{after}" for t in tasks]
                )
            else:
                targets = [after]
            if not all(done(t) for t in targets):
                return False
        return True

    ready = []
    for node in plan_order(graph, tasks):
        rec = state.nodes.get(node)
        task, name = _split(node)
        if rec is None:
            raise RunStateError(f"state missing node {node}")
        if rec.status not in ("pending", "failed"):
            continue
        if predecessors_done(task, name):
            ready.append(node)
    return ready


# ---------------------------------------------------------------- estimates


def estimate(state: RunState, kind: str, steps: int, pacing: Pacing) -> float:
    rates = [
        (u.pct_after - u.pct_before) / u.steps
        for u in state.usage
        if u.kind == kind
        and u.steps > 0
        and u.pct_before is not None
        and u.pct_after is not None
        and u.pct_after >= u.pct_before
    ]
    if len(rates) >= pacing.min_samples:
        return statistics.median(rates) * steps
    return pacing.default_pct_per_step * steps


# ---------------------------------------------------------------- decisions


@dataclass(frozen=True)
class Dispatch:
    node: str
    model: str | None
    estimate: float
    pacing: Literal["on", "off"]
    resets_at: str | None = None


@dataclass(frozen=True)
class Pause:
    until: str
    reason: str


@dataclass(frozen=True)
class Done:
    pass


@dataclass(frozen=True)
class Blocked:
    escalations: list[Escalation] = field(default_factory=list)


@dataclass(frozen=True)
class Waiting:
    running: list[str]


Decision = Dispatch | Pause | Done | Blocked | Waiting


def _is_past(resets_at: str, now: str) -> bool:
    try:
        return datetime.fromisoformat(resets_at) <= datetime.fromisoformat(now)
    except ValueError:
        return resets_at <= now


def node_estimate(
    state: RunState, graph: Graph, tasks: list[TaskInfo], node: str, pacing: Pacing
) -> float:
    task, name = _split(node)
    if graph.nodes[name].kind != "agent":
        return 0.0
    steps = (
        next(t.steps for t in tasks if t.id == task)
        if task is not None
        else sum(t.steps for t in tasks)
    )
    return estimate(state, name, steps, pacing)


def next_decision(
    state: RunState,
    graph: Graph,
    tasks: list[TaskInfo],
    usage: Usage,
    pacing: Pacing,
    now: str,
) -> Decision:
    ready = ready_nodes(state, graph, tasks)
    if not ready:
        running = [n for n, r in state.nodes.items() if r.status == "running"]
        if running:
            return Waiting(running)
        if all(r.status == "done" for r in state.nodes.values()):
            return Done()
        return Blocked(list(state.escalations))

    def model(node: str) -> str | None:
        return graph.model_for(_split(node)[1])

    five = usage.five_hour
    if five is None:
        first = ready[0]
        est = node_estimate(state, graph, tasks, first, pacing)
        return Dispatch(first, model(first), est, "off")

    fresh = state.window != five.resets_at or _is_past(five.resets_at, now)
    considered = ready[:1] if fresh else ready
    weekly = usage.weekly

    def fits(win: Window | None, est: float) -> bool:
        return win is None or est * pacing.margin <= 100 - win.pct_used

    estimates = {n: node_estimate(state, graph, tasks, n, pacing) for n in considered}
    for node in considered:
        if fits(five, estimates[node]) and fits(weekly, estimates[node]):
            return Dispatch(node, model(node), estimates[node], "on", five.resets_at)

    weekly_blocks = weekly is not None and not any(fits(weekly, e) for e in estimates.values())
    if weekly is not None and weekly_blocks:
        return Pause(until=weekly.resets_at, reason="no ready node fits the weekly window")
    if fresh and estimates[considered[0]] * pacing.margin > 100:
        return Blocked([Escalation(considered[0], "estimate exceeds a full window", now)])
    return Pause(until=five.resets_at, reason="no ready node fits the 5-hour window")
