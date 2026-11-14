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
from wf.config import ConfigError, Graph, load_graph


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
    return p


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
    if cmd == "start":
        try:
            st.start_round(state, args.node, _budget(load_graph(graph_path), args.node), now)
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
