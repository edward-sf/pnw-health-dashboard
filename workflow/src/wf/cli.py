"""Command-line entry point: `wf <command>`. Commands print JSON on stdout."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from wf import state as st
from wf.config import ConfigError, Graph, load_graph, load_project
from wf.schedule import (
    Blocked,
    Decision,
    Dispatch,
    Done,
    TaskInfo,
    load_task_graph,
    next_decision,
    parse_usage,
)


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _git_root() -> Path:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
        )
    except (OSError, subprocess.CalledProcessError) as e:
        raise st.RunStateError("not inside a git repository; pass --root") from e
    return Path(out.stdout.strip())


def _budget(graph: Graph, node: str) -> int | None:
    spec = graph.nodes.get(node.rpartition(".")[2])
    if spec is None:
        raise st.RunStateError(f"unknown node '{node}'")
    return spec.budget


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="wf")
    p.add_argument("--root", type=Path, help="repository root (default: git toplevel)")
    p.add_argument("--graph", type=Path, help="graph.toml (default: <root>/workflow/graph.toml)")
    p.add_argument(
        "--project", type=Path, help="project.toml (default: <root>/workflow/project.toml)"
    )
    sub = p.add_subparsers(dest="command", required=True)

    def add(name: str, node: bool = False) -> argparse.ArgumentParser:
        sp = sub.add_parser(name)
        sp.add_argument("--milestone", type=int, required=True)
        if node:
            sp.add_argument("node")
        return sp

    init = add("init")
    init.add_argument("--tasks", required=True, help="comma-separated task ids")
    init.add_argument("--task-graph", default="", help="repo-relative task graph path")
    add("status")
    add("start", node=True)
    fin = add("finish", node=True)
    fin.add_argument("--status", required=True, choices=["done", "failed", "escalated"])
    fin.add_argument("--note")
    add("resume", node=True)
    esc = add("escalate", node=True)
    esc.add_argument("--reason", required=True)
    nxt = add("next")
    nxt.add_argument("--usage", required=True, help="get_usage JSON file, or - for stdin")
    use = add("usage", node=True)
    use.add_argument("--pct-before", type=float, required=True)
    use.add_argument("--pct-after", type=float, required=True)
    use.add_argument("--tokens", type=int)
    return p


def _tasks(root: Path, state: st.RunState) -> list[TaskInfo]:
    if not state.task_graph:
        raise st.RunStateError("run state has no task graph; re-run setup")
    return load_task_graph(root / state.task_graph).infos()


def _decision_json(decision: Decision) -> dict[str, object]:
    if isinstance(decision, Dispatch):
        return {"decision": "dispatch", **asdict(decision)}
    if isinstance(decision, Blocked):
        return {"decision": "blocked", **asdict(decision)}
    if isinstance(decision, Done):
        return {"decision": "done"}
    return {"decision": "pause", **asdict(decision)}


def _next(root: Path, args: argparse.Namespace, state: st.RunState, now: str) -> object:
    src = args.usage
    try:
        text = sys.stdin.read() if src == "-" else Path(src).read_text()
        usage = parse_usage(json.loads(text))
    except (OSError, ValueError, AttributeError) as e:
        raise st.RunStateError(f"cannot read usage JSON from {src}") from e
    project = load_project(args.project or root / "workflow/project.toml")
    graph = load_graph(args.graph or root / "workflow/graph.toml")
    decision = next_decision(state, graph, _tasks(root, state), usage, project.pacing, now)
    if isinstance(decision, Blocked):
        known = {(e.node, e.reason) for e in state.escalations}
        for esc in decision.escalations:
            if (esc.node, esc.reason) not in known:
                st.escalate(state, esc.node, esc.reason, now)
        st.save(root, state)
    out = _decision_json(decision)
    (st.run_dir(root, args.milestone) / "last-decision.json").write_text(json.dumps(out) + "\n")
    return out


def _window_from_last_decision(root: Path, milestone: int, node: str) -> str | None:
    try:
        last = json.loads((st.run_dir(root, milestone) / "last-decision.json").read_text())
    except (OSError, ValueError):
        return None
    if (
        isinstance(last, dict)
        and last.get("decision") == "dispatch"
        and last.get("node") == node
        and last.get("pacing") == "on"
        and isinstance(last.get("resets_at"), str)
    ):
        return str(last["resets_at"])
    return None


def _steps(tasks: list[TaskInfo], node: str) -> int:
    task, dot, _ = node.rpartition(".")
    if not dot:
        return sum(t.steps for t in tasks)
    for t in tasks:
        if t.id == task:
            return t.steps
    raise st.RunStateError(f"unknown task '{task}'")


def _run(args: argparse.Namespace) -> object:
    root: Path = args.root or _git_root()
    m: int = args.milestone
    cmd: str = args.command
    graph_path: Path = args.graph or root / "workflow/graph.toml"
    now = _now()
    if cmd == "init":
        tasks = [t for t in args.tasks.split(",") if t]
        if not tasks:
            raise st.RunStateError("--tasks needs at least one task id")
        state = st.init_run(root, m, load_graph(graph_path), tasks, args.task_graph)
        return asdict(state)
    state = st.load(root, m)
    if cmd == "status":
        return asdict(state)
    if cmd == "next":
        return _next(root, args, state, now)
    if cmd == "usage":
        _budget(load_graph(graph_path), args.node)  # validates the node name
        sample = st.UsageSample(
            node=args.node,
            kind=args.node.rpartition(".")[2],
            steps=_steps(_tasks(root, state), args.node),
            pct_before=args.pct_before,
            pct_after=args.pct_after,
            tokens=args.tokens,
        )
        state.usage.append(sample)
        st.save(root, state)
        return asdict(sample)
    if cmd == "start":
        try:
            st.start_round(state, args.node, _budget(load_graph(graph_path), args.node), now)
            window = _window_from_last_decision(root, m, args.node)
            if window is not None:
                state.window = window
        except st.BudgetExhausted:
            st.save(root, state)  # keep the escalation record
            raise
    elif cmd == "finish":
        st.finish(state, args.node, args.status, now, args.note)
    elif cmd == "resume":
        st.resume(state, args.node, now)
    else:
        st.escalate(state, args.node, args.reason, now)
    st.save(root, state)
    return asdict(state.nodes[args.node])


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = _run(args)
    except (st.RunStateError, ConfigError) as e:
        print(f"wf: {e}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0
