"""`gh` and `git` behind small protocols, so setup and later scripts test without a network."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any, Protocol


class CommandError(Exception):
    """A `gh` or `git` call failed."""


class Gh(Protocol):
    def run(self, args: list[str]) -> str: ...


class Git(Protocol):
    def run(self, args: list[str]) -> str: ...


def _run(tool: str, args: list[str], cwd: Path | None) -> str:
    try:
        done = subprocess.run([tool, *args], capture_output=True, text=True, cwd=cwd)
    except OSError as e:
        raise CommandError(f"cannot run {tool}: {e.strerror}") from e
    if done.returncode != 0:
        detail = done.stderr.strip() or done.stdout.strip() or f"exit {done.returncode}"
        raise CommandError(f"{tool} {' '.join(args[:2])} failed: {detail}")
    return done.stdout


class SubprocessGh:
    def run(self, args: list[str]) -> str:
        return _run("gh", args, None)


class SubprocessGit:
    def __init__(self, root: Path) -> None:
        self.root = root

    def run(self, args: list[str]) -> str:
        return _run("git", args, self.root)


def _value(args: list[str], flag: str) -> str:
    return args[args.index(flag) + 1]


class _Fake:
    """Records every call. `canned` maps an argument prefix (e.g. "pr view") to the output,
    and the longest matching prefix wins. It is checked before any built-in behaviour."""

    def __init__(self, canned: dict[str, str] | None = None) -> None:
        self.calls: list[list[str]] = []
        self.canned: dict[tuple[str, ...], str] = {
            tuple(k.split()): v for k, v in (canned or {}).items()
        }

    def _canned(self, args: list[str]) -> str | None:
        best: tuple[str, ...] | None = None
        for prefix in self.canned:
            if tuple(args[: len(prefix)]) == prefix and (best is None or len(prefix) > len(best)):
                best = prefix
        return None if best is None else self.canned[best]

    def run(self, args: list[str]) -> str:
        self.calls.append(list(args))
        canned = self._canned(args)
        return canned if canned is not None else self._default(args)

    def _default(self, args: list[str]) -> str:
        return ""


class FakeGit(_Fake):
    def __init__(
        self, branches: set[str] | None = None, canned: dict[str, str] | None = None
    ) -> None:
        super().__init__(canned)
        self.branches = set(branches or ())

    def _default(self, args: list[str]) -> str:
        if args[:2] == ["ls-remote", "--heads"]:
            name = args[3]
            return f"abc123\trefs/heads/{name}\n" if name in self.branches else ""
        if args[0] == "push":
            target = args[-1].split(":")[-1].removeprefix("refs/heads/")
            self.branches.add(target)
            return ""
        if args[:2] == ["status", "--porcelain"]:
            return "A  changed\n"
        return ""


class FakeGh(_Fake):
    """Issues, milestones and PRs held in memory; numbers share one counter, as on GitHub."""

    def __init__(
        self,
        existing_issues: dict[str, int] | None = None,
        next_issue: int = 300,
        milestones: list[str] | None = None,
        prs: list[dict[str, Any]] | None = None,
        canned: dict[str, str] | None = None,
    ) -> None:
        super().__init__(canned)
        self.issues = dict(existing_issues or {})
        self.next_number = next_issue
        self.milestones = list(milestones or [])
        self.prs = [dict(p) for p in (prs or [])]

    def _take(self) -> int:
        n = self.next_number
        self.next_number += 1
        return n

    def created_issue_body(self, title: str) -> str:
        for c in self.calls:
            if c[:2] == ["issue", "create"] and _value(c, "--title") == title:
                return _value(c, "--body")
        raise KeyError(title)

    def _default(self, args: list[str]) -> str:
        if args[:2] == ["issue", "list"]:
            return json.dumps([{"number": n, "title": t} for t, n in self.issues.items()])
        if args[:2] == ["issue", "create"]:
            n = self._take()
            self.issues[_value(args, "--title")] = n
            return f"https://github.com/o/r/issues/{n}\n"
        if args[0] == "api" and "--method" in args:
            self.milestones.append(next(a for a in args if a.startswith("title="))[6:])
            return "{}"
        if args[0] == "api":
            return json.dumps(
                [{"number": i + 1, "title": t} for i, t in enumerate(self.milestones)]
            )
        if args[:2] == ["pr", "list"]:
            head = _value(args, "--head")
            return json.dumps([p for p in self.prs if p["headRefName"] == head])
        if args[:2] == ["pr", "create"]:
            n = self._take()
            self.prs.append({"number": n, "state": "OPEN", "headRefName": _value(args, "--head")})
            return f"https://github.com/o/r/pull/{n}\n"
        if args[:2] == ["pr", "merge"]:
            for p in self.prs:
                if str(p["number"]) == args[2]:
                    p["state"] = "MERGED"
            return ""
        return ""


def trailing_number(url: str) -> int:
    m = re.search(r"/(\d+)\s*$", url)
    if not m:
        raise CommandError(f"cannot read a number from gh output: {url.strip()!r}")
    return int(m.group(1))
