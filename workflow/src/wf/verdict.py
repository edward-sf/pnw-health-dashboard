"""Reviewer verdicts: a JSON file per review, validated and recorded by `wf ingest`."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from wf.state import ReviewRecord, RunState, RunStateError

Severity = Literal["critical", "important", "minor"]
_SEVERITIES = ("critical", "important", "minor")
_RESULTS = ("pass", "findings")
_BLOCKING = ("critical", "important")


class VerdictError(Exception):
    """A verdict file is unreadable, invalid, or for another node or commit."""


@dataclass(frozen=True)
class Finding:
    id: str
    severity: Severity
    title: str
    file: str | None
    line: int | None
    detail: str


@dataclass(frozen=True)
class Verdict:
    node: str
    task: str | None
    sha: str
    result: Literal["pass", "findings"]
    findings: list[Finding]
    blocking: bool


def _str(raw: dict[str, Any], key: str, where: str, problems: list[str]) -> None:
    if not isinstance(raw.get(key), str):
        problems.append(f"{where}{key}: must be a string")


def _finding(raw: Any, i: int, problems: list[str]) -> Finding | None:
    where = f"findings[{i}]."
    if not isinstance(raw, dict):
        problems.append(f"findings[{i}]: must be an object")
        return None
    before = len(problems)
    for key in ("id", "title", "detail"):
        _str(raw, key, where, problems)
    if raw.get("severity") not in _SEVERITIES:
        problems.append(f"{where}severity: must be one of {', '.join(_SEVERITIES)}")
    if raw.get("file") is not None and not isinstance(raw["file"], str):
        problems.append(f"{where}file: must be a string or null")
    line = raw.get("line")
    if line is not None and (not isinstance(line, int) or isinstance(line, bool)):
        problems.append(f"{where}line: must be an integer or null")
    if len(problems) > before:
        return None
    return Finding(raw["id"], raw["severity"], raw["title"], raw.get("file"), line, raw["detail"])


def parse_verdict(raw: Any) -> Verdict:
    """Validate `raw`; the error lists every violation."""
    if not isinstance(raw, dict):
        raise VerdictError("verdict must be a JSON object")
    problems: list[str] = []
    for key in ("node", "sha"):
        _str(raw, key, "", problems)
    if raw.get("task") is not None and not isinstance(raw["task"], str):
        problems.append("task: must be a string or null")
    if raw.get("result") not in _RESULTS:
        problems.append(f"result: must be one of {', '.join(_RESULTS)}")
    findings: list[Finding] = []
    items = raw.get("findings")
    if not isinstance(items, list):
        problems.append("findings: must be a list")
    else:
        for i, item in enumerate(items):
            f = _finding(item, i, problems)
            if f is not None:
                findings.append(f)
    blocking = any(f.severity in _BLOCKING for f in findings)
    if isinstance(items, list) and not problems:
        if raw["result"] == "pass" and blocking:
            problems.append("result: 'pass' but there are critical or important findings")
        if raw["result"] == "findings" and not findings:
            problems.append("result: 'findings' but the findings list is empty")
    if problems:
        raise VerdictError("invalid verdict: " + "; ".join(problems))
    return Verdict(raw["node"], raw.get("task"), raw["sha"], raw["result"], findings, blocking)


def load_verdict(path: Path) -> Verdict:
    try:
        raw = json.loads(path.read_text())
    except OSError as e:
        raise VerdictError(f"cannot read verdict {path}: {e.strerror}") from e
    except ValueError as e:
        raise VerdictError(f"verdict is not valid JSON: {path}") from e
    return parse_verdict(raw)


def ingest(state: RunState, node: str, path: Path, now: str, head: str) -> ReviewRecord:
    """Record a verdict for `node`, provided it names this node and the PR's current head."""
    if node not in state.nodes:
        raise RunStateError(f"unknown node '{node}'")
    verdict = load_verdict(path)
    if verdict.node != node:
        raise VerdictError(f"verdict is for node '{verdict.node}', not '{node}'")
    if verdict.sha != head:
        raise VerdictError(f"verdict sha {verdict.sha} is not the head {head}: review is stale")
    task = node.rpartition(".")[0] or node  # final and delta reviews are keyed by node name
    record = ReviewRecord(task, verdict.sha, node, verdict.result, str(path), now)
    state.reviews.append(record)
    return record
