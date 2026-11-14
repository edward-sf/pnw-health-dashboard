"""Run the local checks for the areas a branch touches, and record the result against HEAD."""

from __future__ import annotations

import os
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from wf.config import Project
from wf.github import CommandError, Git
from wf.state import GateRecord


class Runner(Protocol):
    def __call__(self, cmd: str, cwd: Path, env: dict[str, str]) -> int: ...


def _under(path: str, prefix: str) -> bool:
    return path.startswith(prefix if prefix.endswith("/") else prefix + "/")


def areas_touched(paths: list[str], project: Project) -> set[str]:
    return {
        name
        for name, area in project.areas.items()
        if any(_under(p, prefix) for p in paths for prefix in area.paths)
    }


def _glob(pattern: str) -> re.Pattern[str]:
    out = ""
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif pattern[i] == "*":
            out += "[^/]*"
            i += 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile(out + r"\Z")


def changed_specs(paths: list[str], project: Project) -> list[str]:
    """Changed e2e specs, relative to the e2e working directory (where Playwright runs)."""
    cwd = project.e2e.cwd
    spec = _glob(project.e2e.spec_glob)
    return [p.removeprefix(cwd + "/") for p in paths if _under(p, cwd) and spec.match(
        p.removeprefix(cwd + "/"))]  # fmt: skip


def _stamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_gates(
    project: Project, root: Path, task: str, base_ref: str, git: Git, runner: Runner
) -> GateRecord:
    diff = git.run(["diff", "--name-only", "--diff-filter=d", f"{base_ref}...HEAD"])
    paths = [line for line in diff.splitlines() if line]
    sha = git.run(["rev-parse", "HEAD"]).strip()
    touched = areas_touched(paths, project)
    e2e = project.e2e
    # (check name, [(command, cwd, env)]) in run order
    plan: list[tuple[str, list[tuple[str, Path, dict[str, str]]]]] = []
    for name, area in project.areas.items():
        if name in touched:
            plan += [(f"{name}:{c}", [(c, root / area.cwd, {})]) for c in area.commands]
    if any(_under(p, prefix) for p in paths for prefix in e2e.paths):
        cwd = root / e2e.cwd
        plan.append(("e2e", [(e2e.build, cwd, {}), (e2e.run, cwd, {})]))
        specs = changed_specs(paths, project)
        if specs:
            cmd = f"{e2e.run} --repeat-each={e2e.repeat_each} {' '.join(specs)}"
            plan.append(("e2e:throttled", [(cmd, cwd, {"E2E_CPU_THROTTLE": str(e2e.throttle)})]))
    checks = {name: False for name, _ in plan}
    for name, commands in plan:
        begin = getattr(runner, "begin", None)
        if begin is not None:
            begin(task, sha, name)
        if not all(runner(cmd, cwd, env) == 0 for cmd, cwd, env in commands):
            break
        checks[name] = True
    return GateRecord(task, sha, checks, all(checks.values()), _stamp())


class LoggedRunner:
    """Runs commands in a shell, logging each check to `<logs>/<task>-<sha>-<check>.log`."""

    def __init__(self, logs: Path) -> None:
        self.logs = logs
        self._log: Path | None = None

    def begin(self, task: str, sha: str, check: str) -> None:
        self.logs.mkdir(parents=True, exist_ok=True)
        slug = re.sub(r"[^A-Za-z0-9._-]+", "_", check).strip("_")
        self._log = self.logs / f"{task}-{sha}-{slug}.log"
        self._log.write_text("")

    def __call__(self, cmd: str, cwd: Path, env: dict[str, str]) -> int:
        with (self._log or Path(os.devnull)).open("a") as out:
            out.write(f"$ {cmd}\n")
            out.flush()
            try:
                done = subprocess.run(
                    cmd, shell=True, cwd=cwd, env=os.environ | env, stdout=out,
                    stderr=subprocess.STDOUT,
                )  # fmt: skip
            except OSError as e:
                raise CommandError(f"cannot run '{cmd}': {e.strerror}") from e
            out.write(f"\nexit {done.returncode}\n")
        return done.returncode
