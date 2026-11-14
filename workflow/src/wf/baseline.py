"""Baseline of a finished milestone: tokens spent, deploy failures, post-review fixes."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from wf.github import Gh

_COUNTED = ("input_tokens", "output_tokens", "cache_creation_input_tokens")


@dataclass
class Baseline:
    milestone: int
    fix_prs_after_final_review: list[int]
    red_deploys_after_merge: int
    tokens_by_session: dict[str, int]
    tokens_per_task: float | None
    notes: list[str] = field(default_factory=list)


@dataclass
class _Scan:
    tokens: int = 0
    cache_read: int = 0
    skipped: int = 0


def _scan(jsonl: Path) -> _Scan:
    scan = _Scan()
    for line in jsonl.read_text(errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            scan.skipped += 1
            continue
        if not isinstance(entry, dict) or entry.get("type") != "assistant":
            continue
        message = entry.get("message")
        usage = message.get("usage") if isinstance(message, dict) else None
        if not isinstance(usage, dict):
            continue
        scan.tokens += sum(_int(usage.get(k)) for k in _COUNTED)
        scan.cache_read += _int(usage.get("cache_read_input_tokens"))
    return scan


def _int(value: object) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def session_tokens(jsonl: Path) -> int:
    """Input + output + cache-creation tokens over assistant messages; cache reads excluded."""
    return _scan(jsonl).tokens


def _moment(text: str) -> datetime:
    when = datetime.fromisoformat(text)
    return when if when.tzinfo else when.replace(tzinfo=UTC)


def _first_timestamp(jsonl: Path) -> datetime | None:
    with jsonl.open(errors="replace") as f:
        for line in f:
            try:
                stamp = json.loads(line).get("timestamp")
                if isinstance(stamp, str):
                    return _moment(stamp)
            except (ValueError, AttributeError):
                continue
    return None


def _red_deploys(gh: Gh, branch: str, notes: list[str]) -> int:
    out = gh.run(
        [
            "run", "list", "--workflow", "build-deploy.yml", "--branch", branch,
            "--limit", "100", "--json", "conclusion,headSha,createdAt",
        ]
    )  # fmt: skip
    runs = [r for r in json.loads(out or "[]") if isinstance(r, dict)]
    if not runs:
        notes.append(f"no build-deploy runs found on {branch}")
        return 0
    runs.sort(key=lambda r: str(r.get("createdAt", "")))
    first = str(runs[0].get("createdAt", ""))
    red = sum(1 for r in runs if r.get("conclusion") == "failure" and str(r["createdAt"]) >= first)
    notes.append(f"red deploys counted from the first run on {branch} ({first}); {len(runs)} runs")
    return red


def baseline(
    transcripts_dir: Path,
    since: str,
    until: str,
    gh: Gh,
    branch: str,
    task_count: int,
    fix_prs: list[int],
    milestone: int = 0,
) -> Baseline:
    start, end = _moment(since), _moment(until)
    notes: list[str] = []
    by_session: dict[str, int] = {}
    cache_read = skipped = 0
    for jsonl in sorted(transcripts_dir.glob("*.jsonl")):
        first = _first_timestamp(jsonl)
        if first is None or not start <= first < end:
            continue
        files = [jsonl, *sorted((jsonl.parent / jsonl.stem / "subagents").glob("*.jsonl"))]
        scans = [_scan(f) for f in files]
        by_session[jsonl.stem] = sum(s.tokens for s in scans)
        cache_read += sum(s.cache_read for s in scans)
        skipped += sum(s.skipped for s in scans)
        notes.append(
            f"session {jsonl.stem} first at {first.isoformat()}, {len(files) - 1} subagents"
        )
    notes.append(f"cache_read_input_tokens (not counted above): {cache_read}")
    notes.append(f"unparseable lines skipped: {skipped}")
    red = _red_deploys(gh, branch, notes)
    total = sum(by_session.values())
    return Baseline(
        milestone=milestone,
        fix_prs_after_final_review=list(fix_prs),
        red_deploys_after_merge=red,
        tokens_by_session=by_session,
        tokens_per_task=total / task_count if task_count else None,
        notes=notes,
    )
