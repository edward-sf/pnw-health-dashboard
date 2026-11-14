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
from wf.deploy import watch_deploy
from wf.gates import LoggedRunner, run_gates
from wf.github import CommandError, SubprocessGh, SubprocessGit
from wf.merge import FIX_TASK, MergeCheck, check_merge, merge_task, task_for_branch, view_pr
from wf.milestone_pr import (
    mark_ready,
    post_final_review,
    post_outcomes,
    render_milestone_body,
    render_outcomes,
)
from wf.packages import (
    delta_package,
    final_package,
    task_review_package,
    verdict_path,
)
from wf.schedule import (
    Blocked,
    Decision,
    Dispatch,
    Done,
    TaskGraph,
    TaskInfo,
    Waiting,
    load_task_graph,
    next_decision,
    parse_usage,
)
from wf.setup import setup_milestone
from wf.tasks import PlanError, check_plan_file, parse_plan_tasks
from wf.verdict import VerdictError, ingest, load_verdict


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
    chk = sub.add_parser("check-plan")
    chk.add_argument("plan", type=Path)
    setup = add("setup")
    setup.add_argument("--plan", type=Path, required=True, help="plan file, repo-relative")
    setup.add_argument("--spec", type=Path, required=True, help="spec file, repo-relative")
    add("status")
    gate = add("gate", node=True)
    gate.add_argument(
        "--base", help="base ref to diff against (default: origin/<milestone branch>)"
    )
    start = add("start", node=True)
    start.add_argument("--branch", help="batched-fix only: the fix PR's branch")
    fin = add("finish", node=True)
    fin.add_argument("--status", required=True, choices=["done", "failed", "escalated"])
    fin.add_argument("--note")
    add("resume", node=True)
    clr = add("clear", node=True)
    clr.add_argument("--note", required=True, help="the author's decision")
    esc = add("escalate", node=True)
    esc.add_argument("--reason", required=True)
    nxt = add("next")
    nxt.add_argument("--usage", required=True, help="get_usage JSON file, or - for stdin")
    pkg = sub.add_parser("package")
    kinds = pkg.add_subparsers(dest="kind", required=True)
    for kind in ("task-review", "final", "delta"):
        kp = kinds.add_parser(kind)
        kp.add_argument("--milestone", type=int, required=True)
        if kind == "task-review":
            kp.add_argument("--task", required=True)
            kp.add_argument("--base", help="base ref (default: origin/<milestone branch>)")
            kp.add_argument("--pr", type=int, help="PR number (default: found from the branch)")
        elif kind == "final":
            kp.add_argument("--range", required=True, help="commit range, e.g. a..b")
        else:
            kp.add_argument("--range", required=True, help="the fix's commit range")
            kp.add_argument(
                "--findings", type=Path, required=True, help="verdict file listing them"
            )
    ing = add("ingest", node=True)
    ing.add_argument("verdict", type=Path)
    ing.add_argument("--pr", type=int, help="PR number (default: found from the task's branch)")
    cm = add("check-merge")
    cm.add_argument("pr", type=int)
    mg = add("merge")
    mg.add_argument("pr", type=int)
    dw = add("deploy-watch", node=True)
    dw.add_argument("--sha", help="merged commit (default: origin/<milestone branch> after fetch)")
    dw.add_argument("--timeout", type=int, default=1800, help="seconds to wait")
    mp = add("milestone-pr")
    mp.add_argument("--ready", action="store_true", help="mark the PR ready for review")
    pfr = sub.add_parser("post-final-review")
    pfr.add_argument("pr", type=int)
    pfr.add_argument("--report", type=Path, required=True)
    pos = sub.add_parser("post-outcomes")
    pos.add_argument("pr", type=int)
    pos.add_argument("--findings", type=Path, required=True, help="the final-review verdict file")
    pos.add_argument(
        "--outcomes", type=Path, required=True, help="JSON object: finding id -> outcome"
    )
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
    if isinstance(decision, Waiting):
        return {"decision": "waiting", **asdict(decision)}
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


def _package(root: Path, args: argparse.Namespace, state: st.RunState) -> object:
    if not state.task_graph:
        raise st.RunStateError("run state has no task graph; re-run setup")
    graph = load_task_graph(root / state.task_graph)
    plan, spec = root / graph.plan, root / graph.spec
    git = SubprocessGit(root)
    if args.kind == "task-review":
        base = args.base
        if not base:
            project = load_project(args.project or root / "workflow/project.toml")
            base = "origin/" + project.milestone_branch.format(n=args.milestone)
        node = f"{args.task}.task-review"
        head = _head(root, state, node, args.pr)
        path = task_review_package(root, state, plan, spec, args.task, base, git, head)
    elif args.kind == "final":
        project = load_project(args.project or root / "workflow/project.toml")
        path = final_package(root, state, plan, spec, args.range, git, SubprocessGh(), project)
        node = "final-review"
        report = root / project.reviews_dir / f"{_now()[:10]}-m{args.milestone}-final-review.md"
        return {
            "path": str(path),
            "verdict_path": str(verdict_path(root, state, node)),
            "report_path": str(report),
        }
    else:
        findings = load_verdict(args.findings).findings
        path = delta_package(root, state, args.range, findings, git)
        node = "delta-review"
    return {"path": str(path), "verdict_path": str(verdict_path(root, state, node))}


def _head(root: Path, state: st.RunState, node: str, pr: int | None) -> str:
    """The commit a verdict must be for: the PR head for a task review, else HEAD."""
    if pr is None and node.endswith(".task-review"):
        task = node.rpartition(".")[0]
        graph = load_task_graph(root / state.task_graph) if state.task_graph else None
        info = graph.tasks.get(task) if graph else None
        if info is None or not info.branch:
            raise st.RunStateError(f"no branch recorded for {task}; pass --pr")
        out = SubprocessGh().run(["pr", "list", "--head", info.branch, "--json", "number"])
        try:
            found = json.loads(out)
            pr = int(found[0]["number"]) if found else None
        except (ValueError, KeyError, TypeError, IndexError) as e:
            raise CommandError("cannot read gh pr list output") from e
        if pr is None:
            raise st.RunStateError(f"no PR for branch {info.branch}; pass --pr")
    if pr is None:
        return SubprocessGit(root).run(["rev-parse", "HEAD"]).strip()
    out = SubprocessGh().run(["pr", "view", str(pr), "--json", "headRefOid"])
    try:
        return str(json.loads(out)["headRefOid"])
    except (ValueError, KeyError, TypeError) as e:
        raise CommandError(f"cannot read the head of PR {pr}") from e


def _task_of_pr(root: Path, state: st.RunState, gh: SubprocessGh, pr: int) -> str | None:
    if not state.task_graph:
        raise st.RunStateError("run state has no task graph; re-run setup")
    branch = str(view_pr(gh, pr, "headRefName").get("headRefName", ""))
    if state.fix_branch and branch == state.fix_branch:
        return FIX_TASK
    return task_for_branch(load_task_graph(root / state.task_graph), branch)


def _check_merge(root: Path, state: st.RunState, pr: int) -> object:
    gh = SubprocessGh()
    task = _task_of_pr(root, state, gh, pr)
    if task is None:
        return asdict(MergeCheck(False, [f"PR {pr} is not on any task's branch"]))
    return asdict(check_merge(state, task, pr, gh))


def _merge(root: Path, state: st.RunState, pr: int, now: str) -> object:
    gh = SubprocessGh()
    task = _task_of_pr(root, state, gh, pr)
    if task is None:
        raise st.RunStateError(f"PR {pr} is not on any task's branch")
    sha = merge_task(state, task, pr, gh)
    if task != FIX_TASK:  # the fix PR has no merge node of its own
        st.finish(state, f"{task}.merge", "done", now, f"merged as {sha}")
        st.save(root, state)
    return {"task": task, "sha": sha}


def _deploy_watch(root: Path, args: argparse.Namespace, now: str) -> object:
    project = load_project(args.project or root / "workflow/project.toml")
    branch = project.milestone_branch.format(n=args.milestone)
    git = SubprocessGit(root)
    sha = args.sha
    if not sha:
        git.run(["fetch", "origin", branch])
        sha = git.run(["rev-parse", f"origin/{branch}"]).strip()
    result = watch_deploy(SubprocessGh(), project, branch, sha, timeout_s=args.timeout)
    # The watch runs in the background while other commands write state: reload before saving.
    state = st.load(root, args.milestone)
    status: st.NodeStatus = "done" if result.conclusion == "success" else "failed"
    st.finish(state, args.node, status, now, f"{result.conclusion}: {result.run_url or sha}")
    st.save(root, state)
    return {**asdict(result), "sha": sha}


def _merged_prs(gh: SubprocessGh, graph: TaskGraph) -> dict[str, int]:
    """The merged PR of each task, from its branch; tasks with none are left out."""
    prs: dict[str, int] = {}
    for task_id, node in graph.tasks.items():
        if not node.branch:
            continue
        out = gh.run(["pr", "list", "--state", "merged", "--head", node.branch, "--json", "number"])
        try:
            found = json.loads(out)
            if found:
                prs[task_id] = int(found[0]["number"])
        except (ValueError, KeyError, TypeError) as e:
            raise CommandError(f"cannot read gh pr list output for {node.branch}") from e
    return prs


def _milestone_pr(root: Path, args: argparse.Namespace, state: st.RunState) -> object:
    if not state.task_graph:
        raise st.RunStateError("run state has no task graph; re-run setup")
    project = load_project(args.project or root / "workflow/project.toml")
    graph = load_task_graph(root / state.task_graph)
    try:
        tasks = parse_plan_tasks((root / graph.plan).read_text())
    except OSError as e:
        raise st.RunStateError(f"cannot read plan {graph.plan}: {e.strerror}") from e
    issues = {t.id: t.issue for t in graph.tasks.values() if t.issue is not None}
    gh = SubprocessGh()
    prs = _merged_prs(gh, graph)
    head = project.milestone_branch.format(n=args.milestone)
    found = json.loads(
        gh.run(
            [
                "pr",
                "list",
                "--head",
                head,
                "--base",
                project.main_branch,
                "--state",
                "open",
                "--json",
                "number",
            ]
        )  # fmt: skip
    )
    if not found:
        raise st.RunStateError(f"no open milestone PR from {head}; run setup")
    pr = int(found[0]["number"])
    body = str(view_pr(gh, pr, "body").get("body", ""))
    new = render_milestone_body(state, tasks, issues, body, prs)
    gh.run(["pr", "edit", str(pr), "--body", new])
    if args.ready:
        mark_ready(gh, pr)
    return {"pr": pr, "ready": bool(args.ready)}


def _post_outcomes(args: argparse.Namespace) -> object:
    findings = load_verdict(args.findings).findings
    try:
        outcomes = json.loads(args.outcomes.read_text())
    except (OSError, ValueError) as e:
        raise st.RunStateError(f"cannot read outcomes from {args.outcomes}") from e
    if not isinstance(outcomes, dict):
        raise st.RunStateError("outcomes must be a JSON object of finding id -> outcome")
    post_outcomes(SubprocessGh(), args.pr, render_outcomes(findings, outcomes))
    return {"posted": len(findings)}


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
    m: int = getattr(args, "milestone", 0)
    cmd: str = args.command
    graph_path: Path = args.graph or root / "workflow/graph.toml"
    now = _now()
    if cmd == "check-plan":
        return {"problems": check_plan_file(args.plan)}
    if cmd == "setup":
        project = load_project(args.project or root / "workflow/project.toml")
        result = setup_milestone(
            project, root, m, args.plan, args.spec, SubprocessGh(), SubprocessGit(root),
            load_graph(graph_path),
        )  # fmt: skip
        return asdict(result)
    if cmd == "init":
        tasks = [t for t in args.tasks.split(",") if t]
        if not tasks:
            raise st.RunStateError("--tasks needs at least one task id")
        state = st.init_run(root, m, load_graph(graph_path), tasks, args.task_graph)
        return asdict(state)
    if cmd == "post-final-review":
        post_final_review(SubprocessGh(), args.pr, args.report)
        return {"posted": str(args.report)}
    if cmd == "post-outcomes":
        return _post_outcomes(args)
    if cmd == "deploy-watch":
        return _deploy_watch(root, args, now)
    state = st.load(root, m)
    if cmd == "check-merge":
        return _check_merge(root, state, args.pr)
    if cmd == "merge":
        return _merge(root, state, args.pr, now)
    if cmd == "milestone-pr":
        return _milestone_pr(root, args, state)
    if cmd == "status":
        return asdict(state)
    if cmd == "gate":
        project = load_project(args.project or root / "workflow/project.toml")
        base = args.base or "origin/" + project.milestone_branch.format(n=m)
        runner = LoggedRunner(st.run_dir(root, m) / "logs")
        record = run_gates(project, root, args.node, base, SubprocessGit(root), runner)
        state.gates.append(record)
        st.save(root, state)
        return asdict(record)
    if cmd == "package":
        return _package(root, args, state)
    if cmd == "ingest":
        review = ingest(state, args.node, args.verdict, now, _head(root, state, args.node, args.pr))
        st.save(root, state)
        return asdict(review)
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
        if args.branch is not None and args.node != FIX_TASK:
            raise st.RunStateError(f"--branch is only for {FIX_TASK}")
        try:
            st.start_round(state, args.node, _budget(load_graph(graph_path), args.node), now)
            window = _window_from_last_decision(root, m, args.node)
            if window is not None:
                state.window = window
            if args.branch is not None:
                state.fix_branch = args.branch
        except st.BudgetExhausted:
            st.save(root, state)  # keep the escalation record
            raise
    elif cmd == "finish":
        st.finish(state, args.node, args.status, now, args.note)
    elif cmd == "resume":
        st.resume(state, args.node, now)
    elif cmd == "clear":
        st.clear(state, args.node, args.note)
    else:
        st.escalate(state, args.node, args.reason, now)
    st.save(root, state)
    return asdict(state.nodes[args.node])


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = _run(args)
    except (st.RunStateError, ConfigError, PlanError, CommandError, VerdictError) as e:
        print(f"wf: {e}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    problems = result.get("problems") if isinstance(result, dict) else None
    if isinstance(result, dict) and (
        result.get("passed") is False
        or result.get("ok") is False
        or result.get("conclusion") == "failure"
    ):
        return 1
    if isinstance(result, dict) and result.get("conclusion") == "timeout":
        return 3
    return 2 if problems else 0
