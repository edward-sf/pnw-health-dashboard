"""Milestone setup: branch, GitHub milestone, issues, roadmap, task graph, plan PR, milestone PR."""

from __future__ import annotations

import json
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from wf.config import Graph, Project, load_graph
from wf.github import CommandError, Gh, Git, trailing_number
from wf.schedule import TaskGraph, TaskNode, write_task_graph
from wf.state import init_run, run_dir
from wf.tasks import (
    PlanError,
    PlanTask,
    check_plan_text,
    graph_path,
    plan_blob_sha,
    plan_section,
    section_goal,
    section_steps,
    topo_order,
)

_DEFAULT_GRAPH = Path(__file__).resolve().parents[2] / "graph.toml"


@dataclass(frozen=True)
class SetupResult:
    branch: str
    issues: dict[str, int]
    plan_pr: int
    milestone_pr: int


def _slug(title: str) -> str:
    return "-".join(re.findall(r"[a-z0-9]+", title.lower())[:5])


def _rel(root: Path, path: Path) -> Path:
    full = path if path.is_absolute() else root / path
    try:
        return full.resolve().relative_to(root.resolve())
    except ValueError as e:
        raise PlanError(f"{path} is not inside the repository at {root}") from e


def _milestone_name(plan_text: str, n: int) -> str | None:
    m = re.match(rf"# M{n} (.+?)(?: Implementation Plan)?\s*$", plan_text.splitlines()[0])
    return m.group(1) if m else None


def _sentence_case(name: str) -> str:
    first, *rest = name.split(" ")
    return " ".join([first, *(w if w.isupper() else w.lower() for w in rest)])


def _plan_goal(plan_text: str, fallback: str) -> str:
    m = re.search(r"^\*\*Goal:\*\*\s*(.+?)(?:\n\s*\n|\Z)", plan_text, re.DOTALL | re.MULTILINE)
    return " ".join(m.group(1).split()) if m else fallback


def _names(ids: list[str]) -> str:
    return ids[0] if len(ids) == 1 else ", ".join(ids[:-1]) + " and " + ids[-1]


def work_order(tasks: list[PlanTask], order: list[str]) -> str:
    """Tasks that wait on the same others share a clause, in topological order."""
    by_id = {t.id: t for t in tasks}
    groups: dict[tuple[str, ...], list[str]] = {}
    for tid in order:
        groups.setdefault(by_id[tid].depends_on, []).append(tid)
    clauses = [
        _names(ids) if not deps else f"{_names(ids)} after {_names(list(deps))}"
        for deps, ids in groups.items()
    ]
    return "Work order: " + "; ".join(clauses) + "."


def roadmap_section(
    n: int, name: str, goal: str, plan_ref: str, spec_ref: str, lines: list[str], order: str
) -> str:
    body = "\n".join(lines)
    return (
        f"## M{n} — {name}\n**Goal:** {goal}\n\n"
        f"Plan: `{plan_ref}`. Spec: `{spec_ref}`.\n\n{body}\n\n{order}\n"
    )


def update_roadmap(text: str, n: int, section: str) -> str:
    existing = re.search(rf"^## M{n} — .*?(?=^## |\Z)", text, re.DOTALL | re.MULTILINE)
    if existing:
        return text[: existing.start()] + section + "\n" + text[existing.end() :]
    backlog = re.search(r"^## Backlog", text, re.MULTILINE)
    if backlog:
        return text[: backlog.start()] + section + "\n" + text[backlog.start() :]
    return text.rstrip("\n") + "\n\n" + section if text.strip() else section


def _json(gh: Gh, args: list[str]) -> list[dict[str, object]]:
    try:
        out = json.loads(gh.run(args) or "[]")
    except ValueError as e:
        raise CommandError(f"gh {' '.join(args[:2])} did not return JSON") from e
    if not isinstance(out, list):
        raise CommandError(f"gh {' '.join(args[:2])} did not return a list")
    return out


def _issue_body(
    repo: str, branch: str, plan_rel: str, spec_rel: str, task: PlanTask, section: str
) -> str:
    steps = section_steps(section) or ["Task complete as the plan section specifies"]
    criteria = "\n".join(f"- [ ] {s}" for s in steps)
    return (
        f"### Plan section\nhttps://github.com/{repo}/blob/{branch}/{plan_rel}"
        f" — Task {task.number}\n\n"
        f"### Goal\n{section_goal(section, task.title)}\n\n"
        f"Spec: `{spec_rel}`\n\n### Acceptance criteria\n{criteria}"
    )


def _ensure_milestone(gh: Gh, repo: str, title: str) -> None:
    known = {
        m.get("title")
        for m in _json(gh, ["api", f"repos/{repo}/milestones?state=all&per_page=100"])
    }
    if title not in known:
        gh.run(["api", f"repos/{repo}/milestones", "--method", "POST", "-f", f"title={title}"])


def _ensure_issues(
    gh: Gh,
    project: Project,
    n: int,
    milestone: str,
    branch: str,
    plan_rel: str,
    spec_rel: str,
    plan_text: str,
    tasks: list[PlanTask],
) -> dict[str, int]:
    repo = project.repo
    found = _json(
        gh, ["issue", "list", "--repo", repo, "--milestone", milestone, "--state", "all",
             "--json", "number,title", "--limit", "200"]
    )  # fmt: skip
    existing = {str(i["title"]): int(str(i["number"])) for i in found}
    issues: dict[str, int] = {}
    for t in tasks:
        prefix = f"M{n}.{t.id} "
        title = prefix + t.title
        match = next((num for ttl, num in existing.items() if ttl.startswith(prefix)), None)
        if match is None:
            body = _issue_body(repo, branch, plan_rel, spec_rel, t, plan_section(plan_text, t.id))
            args = ["issue", "create", "--repo", repo, "--title", title, "--body", body,
                    "--milestone", milestone]  # fmt: skip
            for label in t.labels:
                args += ["--label", label]
            match = trailing_number(gh.run(args))
        issues[t.id] = match
    return issues


def _build_graph(
    n: int, plan_rel: str, spec_rel: str, sha: str, tasks: list[PlanTask], issues: dict[str, int]
) -> TaskGraph:
    order = topo_order(tasks)
    nodes: dict[str, TaskNode] = {}
    for t in tasks:
        nodes[t.id] = TaskNode(
            id=t.id,
            issue=issues[t.id],
            title=t.title,
            steps=t.steps,
            depends_on=t.depends_on,
            blocks=tuple(o.id for o in tasks if t.id in o.depends_on),
            files=t.files,
            labels=t.labels,
            branch=f"{issues[t.id]}-{_slug(t.title)}",
        )
    return TaskGraph(n, plan_rel, spec_rel, sha, tuple(order), nodes)


def _prs_for_head(gh: Gh, repo: str, head: str) -> list[dict[str, object]]:
    return _json(
        gh, ["pr", "list", "--repo", repo, "--head", head, "--state", "all",
             "--json", "number,state"]
    )  # fmt: skip


def _create_milestone_pr(
    gh: Gh, project: Project, root: Path, n: int, display: str, branch: str
) -> int:
    template = root / ".github/PULL_REQUEST_TEMPLATE/milestone.md"
    try:
        text = template.read_text()
    except OSError as e:
        raise PlanError(f"cannot read {template}: {e.strerror}") from e
    body = text.replace("M<N> — <milestone name>", f"M{n} — {display}").replace(
        "milestone/m<N>", branch
    )
    with tempfile.TemporaryDirectory() as tmp:
        body_file = Path(tmp) / "milestone-pr.md"
        body_file.write_text(body)
        out = gh.run(
            ["pr", "create", "--repo", project.repo, "--draft", "--base", project.main_branch,
             "--head", branch, "--title", f"M{n} — {display}", "--body-file", str(body_file)]
        )  # fmt: skip
    return trailing_number(out)


def setup_milestone(
    project: Project,
    root: Path,
    n: int,
    plan_path: Path,
    spec_path: Path,
    gh: Gh,
    git: Git,
    graph: Graph | None = None,
) -> SetupResult:
    try:
        plan_bytes = (plan_path if plan_path.is_absolute() else root / plan_path).read_bytes()
        spec_bytes = (spec_path if spec_path.is_absolute() else root / spec_path).read_bytes()
    except OSError as e:
        raise PlanError(f"cannot read {e.filename}: {e.strerror}") from e
    plan_text = plan_bytes.decode()
    tasks, problems = check_plan_text(plan_text)
    if problems:
        raise PlanError("plan check failed: " + "; ".join(problems))
    plan_rel, spec_rel = _rel(root, plan_path), _rel(root, spec_path)
    repo = project.repo
    branch = project.milestone_branch.format(n=n)
    docs_branch = f"docs/m{n}-plan"
    name = _milestone_name(plan_text, n)
    milestone = f"M{n} - {name}" if name else f"M{n}"

    git.run(["fetch", "origin", project.main_branch])
    if not git.run(["ls-remote", "--heads", "origin", branch]).strip():
        git.run(["push", "origin", f"origin/{project.main_branch}:refs/heads/{branch}"])
    git.run(["fetch", "origin", branch])
    git.run(["switch", "-C", docs_branch, f"origin/{branch}"])
    for rel, data in ((plan_rel, plan_bytes), (spec_rel, spec_bytes)):
        target = root / rel
        if not target.exists() or target.read_bytes() != data:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

    _ensure_milestone(gh, repo, milestone)
    issues = _ensure_issues(
        gh,
        project,
        n,
        milestone,
        branch,
        plan_rel.as_posix(),
        spec_rel.as_posix(),
        plan_text,
        tasks,
    )

    order = topo_order(tasks)
    by_id = {t.id: t for t in tasks}
    display = _sentence_case(name) if name else f"M{n}"
    in_specs = spec_rel.parent.as_posix() == project.specs_dir
    section = roadmap_section(
        n,
        display,
        _plan_goal(plan_text, display),
        plan_rel.name,
        f"../specs/{spec_rel.name}" if in_specs else spec_rel.as_posix(),
        [f"- M{n}.{tid} #{issues[tid]} {by_id[tid].title}" for tid in (t.id for t in tasks)],
        work_order(tasks, order),
    )
    roadmap = root / project.roadmap
    old = roadmap.read_text() if roadmap.exists() else ""
    roadmap.parent.mkdir(parents=True, exist_ok=True)
    roadmap.write_text(update_roadmap(old, n, section))

    graph_file = root / graph_path(plan_rel)
    write_task_graph(
        graph_file,
        _build_graph(n, plan_rel.as_posix(), spec_rel.as_posix(), plan_blob_sha(plan_bytes),
                     tasks, issues),
    )  # fmt: skip

    paths = [plan_rel.as_posix(), spec_rel.as_posix(), project.roadmap,
             graph_file.relative_to(root).as_posix()]  # fmt: skip
    git.run(["add", "--", *paths])
    changed = bool(git.run(["status", "--porcelain", "--", *paths]).strip())
    prs = _prs_for_head(gh, repo, docs_branch)
    live = [p for p in prs if p["state"] == "OPEN"]
    if changed:
        git.run(["commit", "-m", f"docs: M{n} plan, spec, roadmap and task graph"])
        git.run(["push", "-u", "origin", docs_branch])
    if live:
        plan_pr = int(str(live[0]["number"]))
    elif changed:
        plan_pr = trailing_number(
            gh.run(
                [
                    "pr",
                    "create",
                    "--repo",
                    repo,
                    "--base",
                    branch,
                    "--head",
                    docs_branch,
                    "--title",
                    f"docs: M{n} plan, spec, roadmap and task graph",
                    "--body",
                    f"Part of M{n} setup: the plan, its spec, the roadmap section and "
                    "the committed task graph.",
                ]
            )  # fmt: skip
        )
    else:
        plan_pr = max((int(str(p["number"])) for p in prs), default=0)
    if live or changed:
        gh.run(["pr", "merge", str(plan_pr), "--repo", repo, "--squash"])

    git.run(["fetch", "origin", branch])
    git.run(["switch", "-C", branch, f"origin/{branch}"])

    open_ms = [p for p in _prs_for_head(gh, repo, branch) if p["state"] == "OPEN"]
    if open_ms:
        milestone_pr = int(str(open_ms[0]["number"]))
    else:
        milestone_pr = _create_milestone_pr(gh, project, root, n, display, branch)

    if not (run_dir(root, n) / "state.json").exists():
        init_run(
            root,
            n,
            graph or load_graph(_DEFAULT_GRAPH),
            order,
            graph_file.relative_to(root).as_posix(),
        )
    return SetupResult(branch, issues, plan_pr, milestone_pr)
