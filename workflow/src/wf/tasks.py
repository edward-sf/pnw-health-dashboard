"""The plan's machine-readable task list and the plan text around it."""

from __future__ import annotations

import hashlib
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from wf.config import ConfigError
from wf.schedule import TaskInfo, load_task_graph

_BLOCK = re.compile(r"^```toml workflow-tasks[ \t]*\n(.*?)^```[ \t]*$", re.DOTALL | re.MULTILINE)
_ID = re.compile(r"^T(\d+)$")
_STEP = re.compile(r"^- \[[ xX]\] \*\*Step \d+:\s*(.+?)\*\*", re.MULTILINE)


class PlanError(Exception):
    """The plan's task list is missing, malformed or inconsistent."""


@dataclass(frozen=True)
class PlanTask:
    id: str
    title: str
    steps: int
    depends_on: tuple[str, ...]
    files: tuple[str, ...]
    labels: tuple[str, ...]

    def info(self) -> TaskInfo:
        return TaskInfo(self.id, self.steps, self.depends_on)

    @property
    def number(self) -> int:
        m = _ID.match(self.id)
        return int(m.group(1)) if m else 0


def _strs(raw: dict[str, Any], key: str, where: str) -> tuple[str, ...]:
    items = raw.get(key, [])
    if not isinstance(items, list) or not all(isinstance(i, str) for i in items):
        raise PlanError(f"{where}: '{key}' must be a list of strings")
    return tuple(items)


def _task(raw: Any, index: int) -> PlanTask:
    where = f"workflow-tasks entry {index}"
    if not isinstance(raw, dict):
        raise PlanError(f"{where} must be a table")
    task_id, title, steps = raw.get("id"), raw.get("title"), raw.get("steps")
    if not isinstance(task_id, str) or not _ID.match(task_id):
        raise PlanError(f"{where}: 'id' must look like T1, T2, ...")
    where = f"task {task_id}"
    if not isinstance(title, str) or not title.strip():
        raise PlanError(f"{where}: 'title' must be a non-empty string")
    if not isinstance(steps, int) or isinstance(steps, bool) or steps < 1:
        raise PlanError(f"{where}: 'steps' must be a positive integer")
    return PlanTask(
        id=task_id,
        title=title.strip(),
        steps=steps,
        depends_on=_strs(raw, "depends_on", where),
        files=_strs(raw, "files", where),
        labels=_strs(raw, "labels", where),
    )


def parse_plan_tasks(plan_text: str) -> list[PlanTask]:
    blocks = _BLOCK.findall(plan_text)
    if not blocks:
        raise PlanError("plan has no workflow-tasks block")
    if len(blocks) > 1:
        raise PlanError("plan has more than one workflow-tasks block")
    try:
        raw = tomllib.loads(blocks[0])
    except tomllib.TOMLDecodeError as e:
        raise PlanError(f"workflow-tasks block is not valid TOML: {e}") from e
    entries = raw.get("task")
    if not isinstance(entries, list) or not entries:
        raise PlanError("workflow-tasks block has no [[task]] entries")
    return [_task(e, i + 1) for i, e in enumerate(entries)]


def _reach(task_id: str, deps: dict[str, tuple[str, ...]]) -> set[str]:
    """Every task that `task_id` depends on, directly or transitively."""
    seen: set[str] = set()
    stack = list(deps.get(task_id, ()))
    while stack:
        t = stack.pop()
        if t not in seen:
            seen.add(t)
            stack.extend(deps.get(t, ()))
    return seen


def _cycles(deps: dict[str, tuple[str, ...]]) -> list[list[str]]:
    found: list[list[str]] = []
    done: set[str] = set()

    def visit(node: str, path: list[str]) -> None:
        if node in path:
            found.append([*path[path.index(node) :], node])
            return
        if node in done:
            return
        for dep in deps.get(node, ()):
            visit(dep, [*path, node])
        done.add(node)

    for node in deps:
        visit(node, [])
    return found


def check_plan(tasks: list[PlanTask]) -> list[str]:
    problems: list[str] = []
    seen: set[str] = set()
    for t in tasks:
        if t.id in seen:
            problems.append(f"duplicate task id {t.id}")
        seen.add(t.id)
    deps = {t.id: t.depends_on for t in tasks}
    for t in tasks:
        for dep in t.depends_on:
            if dep not in seen:
                problems.append(f"{t.id} depends on unknown task {dep}")
    for cycle in _cycles(deps):
        problems.append("dependency cycle: " + " -> ".join(cycle))
    for i, later in enumerate(tasks):
        covered = _reach(later.id, deps)
        for earlier in tasks[:i]:
            if earlier.id == later.id or earlier.id in covered:
                continue
            for f in sorted(set(earlier.files) & set(later.files)):
                problems.append(
                    f"{later.id} and {earlier.id} both change {f} "
                    f"but {later.id} does not depend on {earlier.id}"
                )
    return problems


def topo_order(tasks: list[PlanTask]) -> list[str]:
    """Dependencies first; ties keep the plan's order. Assumes check_plan passed."""
    remaining = {t.id: set(t.depends_on) for t in tasks}
    order: list[str] = []
    while remaining:
        ready = [t.id for t in tasks if t.id in remaining and not remaining[t.id]]
        if not ready:
            raise PlanError("dependency cycle")
        pick = ready[0]
        order.append(pick)
        del remaining[pick]
        for deps in remaining.values():
            deps.discard(pick)
    return order


def plan_section(plan_text: str, task_id: str) -> str:
    m = _ID.match(task_id)
    if not m:
        raise PlanError(f"bad task id {task_id}")
    n = m.group(1)
    lines = plan_text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.startswith(f"### Task {n}:")), None)
    if start is None:
        raise PlanError(f"plan has no '### Task {n}:' section")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith(("### ", "## ")):
            end = i
            break
    return "\n".join(lines[start:end]).rstrip() + "\n"


def section_steps(section: str) -> list[str]:
    """The bold step titles, in order."""
    return [m.strip() for m in _STEP.findall(section)]


def section_goal(section: str, fallback: str) -> str:
    """First plain paragraph under the heading, else `fallback`."""
    body = section.split("\n", 1)[1] if "\n" in section else ""
    for para in re.split(r"\n\s*\n", body):
        text = para.strip()
        if text and not text.startswith(("**", "-", "|", "```", "#", ">", "---")):
            return " ".join(text.split())
    return fallback


def plan_blob_sha(plan_bytes: bytes) -> str:
    """The same SHA `git hash-object` gives the file, with no git call."""
    return hashlib.sha1(b"blob %d\0" % len(plan_bytes) + plan_bytes).hexdigest()  # noqa: S324


def graph_path(plan_path: Path) -> Path:
    return plan_path.with_name(f"{plan_path.stem}.tasks.json")


def check_plan_text(plan_text: str) -> tuple[list[PlanTask], list[str]]:
    """Parse the task list and run every check that needs only the plan itself."""
    tasks = parse_plan_tasks(plan_text)
    problems = check_plan(tasks)
    for t in tasks:
        n = t.number
        if not any(ln.startswith(f"### Task {n}:") for ln in plan_text.splitlines()):
            problems.append(f"{t.id} has no '### Task {n}:' section in the plan")
    return tasks, problems


def check_plan_file(plan_path: Path) -> list[str]:
    try:
        data = plan_path.read_bytes()
    except OSError as e:
        raise PlanError(f"cannot read plan {plan_path}: {e.strerror}") from e
    _, problems = check_plan_text(data.decode())
    committed = graph_path(plan_path)
    if committed.exists():
        try:
            stale = load_task_graph(committed).plan_sha != plan_blob_sha(data)
        except ConfigError as e:  # an unreadable graph is as good as stale
            problems.append(f"{e}: re-run wf setup")
            stale = False
        if stale:
            problems.append("task graph is stale: re-run wf setup")
    return problems
