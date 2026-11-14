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
    """Tracks remote branch heads, so a non-fast-forward push is rejected like the real one."""

    def __init__(
        self, branches: set[str] | None = None, canned: dict[str, str] | None = None
    ) -> None:
        super().__init__(canned)
        self.remote: dict[str, str] = {b: f"tip-{b}" for b in (branches or ())}
        self._parent: dict[str, str] = {}  # local branch -> remote head it was started from
        self._tip: dict[str, str] = {}  # local branch -> its own commit, once it has one
        self._current = ""
        self._commits = 0

    @property
    def branches(self) -> set[str]:
        return set(self.remote)

    def _default(self, args: list[str]) -> str:
        if args[:2] == ["ls-remote", "--heads"]:
            return f"abc123\trefs/heads/{args[3]}\n" if args[3] in self.remote else ""
        if args[:2] == ["switch", "-C"]:
            self._current = args[2]
            origin = args[3].removeprefix("origin/")
            self._parent[args[2]] = self.remote.get(origin, f"tip-{origin}")
            self._tip.pop(args[2], None)
        elif args[0] == "commit":
            self._commits += 1
            self._tip[self._current] = f"commit-{self._commits}"
        elif args[0] == "push" and ":" in args[-1]:
            source, target = args[-1].split(":")
            self.remote[target.removeprefix("refs/heads/")] = (
                f"tip-{source.removeprefix('origin/')}"
            )
        elif args[0] == "push":
            name = args[-1]
            if name in self.remote and self._parent.get(name) != self.remote[name]:
                raise CommandError(f"git push failed: ! [rejected] {name} (non-fast-forward)")
            self.remote[name] = self._tip.get(name, self._parent.get(name, f"tip-{name}"))
            self._parent[name] = self.remote[name]
            self._tip.pop(name, None)
        elif args[:2] == ["status", "--porcelain"]:
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
        pr_view: dict[str, Any] | None = None,
        run_lists: list[list[dict[str, Any]]] | None = None,
    ) -> None:
        super().__init__(canned)
        self.pr_view = dict(pr_view or {})
        self.run_lists = [list(r) for r in (run_lists or [])]  # one per `run list`; last repeats
        self.merged: set[str] = set()
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
        if args[:2] == ["pr", "view"] and self.pr_view:
            view = dict(self.pr_view)
            if args[2] in self.merged:
                view["mergeCommit"] = {"oid": f"merge-{args[2]}"}
            return json.dumps(view)
        if args[:2] == ["run", "list"] and self.run_lists:
            return json.dumps(
                self.run_lists.pop(0) if len(self.run_lists) > 1 else self.run_lists[0]
            )
        if args[:2] == ["pr", "merge"]:
            self.merged.add(args[2])
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
