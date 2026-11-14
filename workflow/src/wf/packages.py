"""Context packages: the Markdown a reviewer is handed so it need not explore."""

from __future__ import annotations

import json
import re
from pathlib import Path

from wf.github import Gh, Git
from wf.state import RunState, latest_gate, run_dir
from wf.tasks import plan_section
from wf.verdict import Finding, VerdictError, load_verdict

_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
_LABEL = re.compile(r"^\*\*([^*]+)\*\*(?:\s*\(.*\))?\s*$")
_ITEM = re.compile(r"^(?:[-*]|\d+\.)\s+(.*)$")


def spec_section(spec_text: str, title_regex: str) -> str:
    """The section under the first heading or bold label whose text matches `title_regex`.

    Matching is case-insensitive `re.search` on the heading text or the bold label text (a
    line that is only `**Label**`, optionally followed by a parenthesised remark). Anchor the
    regex (`^anti-goals`) when a longer heading could also match. A heading's section runs to
    the next heading of the same or higher level; a label's to the next label or any heading.
    Returns "" when nothing matches.
    """
    lines = spec_text.splitlines()
    pattern = re.compile(title_regex, re.IGNORECASE)
    for i, line in enumerate(lines):
        heading, label = _HEADING.match(line), _LABEL.match(line)
        text = heading.group(2) if heading else label.group(1).strip() if label else None
        if text is None or not pattern.search(text):
            continue
        level = len(heading.group(1)) if heading else 7
        end = len(lines)
        for j in range(i + 1, len(lines)):
            other = _HEADING.match(lines[j])
            if (other and (not heading or len(other.group(1)) <= level)) or (
                not heading and _LABEL.match(lines[j])
            ):
                end = j
                break
        return "\n".join(lines[i + 1 : end]).strip() + "\n"
    return ""


def _checklist(section: str) -> str:
    out = []
    for line in section.splitlines():
        m = _ITEM.match(line)
        out.append(f"- [ ] {m.group(1)}" if m else line)
    return "\n".join(out).strip()


def _body(text: str, title_regex: str) -> str:
    return spec_section(text, title_regex).strip()


def verdict_path(root: Path, state: RunState, node: str) -> Path:
    """Where the next review round of `node` should write its verdict."""
    rounds = sum(1 for r in state.reviews if r.node == node)
    return run_dir(root, state.milestone) / "verdicts" / f"{node}-r{rounds + 1}.json"


def _write(root: Path, state: RunState, node: str, parts: list[tuple[str, str]]) -> Path:
    path = run_dir(root, state.milestone) / "packages" / f"{node}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n\n".join(f"## {title}\n\n{text.strip() or '(none)'}" for title, text in parts)
    path.write_text(f"# Review package: {node}\n\n{body}\n")
    return path


def _fence(text: str) -> str:
    return f"```diff\n{text.rstrip()}\n```" if text.strip() else ""


def _findings_md(findings: list[Finding]) -> str:
    out = []
    for f in findings:
        where = f" ({f.file}{f':{f.line}' if f.line else ''})" if f.file else ""
        out.append(f"- **{f.id}** [{f.severity}] {f.title}{where}: {f.detail}")
    return "\n".join(out)


def _earlier_findings(root: Path, state: RunState, task: str) -> str:
    found: list[Finding] = []
    notes: list[str] = []
    for r in state.reviews:
        if r.task != task or not r.node.endswith(".task-review"):
            continue
        try:
            found += load_verdict(Path(r.verdict_path)).findings
        except VerdictError as e:
            notes.append(f"- (skipped an earlier review at {r.sha}: {e})")
    return "\n".join(filter(None, [_findings_md(found), *notes]))


def _gate_results(state: RunState, task: str, sha: str) -> str:
    gate = latest_gate(state, task, sha)
    if gate is None:
        return f"No gate record for {task} at {sha or 'this commit'}."
    rows = "\n".join(f"- {'pass' if ok else 'FAIL'}: {name}" for name, ok in gate.checks.items())
    return f"Overall: {'passed' if gate.passed else 'FAILED'} at {gate.sha} ({gate.at})\n\n{rows}"


def _rules(node: str, vpath: Path, free: bool) -> str:
    if free:
        return (
            "You have free access to the repo and the running app. This package is a head "
            "start, not a fence: look wherever the work needs.\n\n"
            f"Write your verdict to `{vpath}` as JSON matching "
            f"`workflow/schemas/verdict.schema.json` "
            f'(`"node": "{node}"`, `"sha"` the head you reviewed).'
        )
    return (
        "Do not explore beyond this package, except to read the current version of a file "
        "where a hunk is not enough.\n\n"
        f"Write your verdict to `{vpath}` as JSON matching "
        f"`workflow/schemas/verdict.schema.json` "
        f'(`"node": "{node}"`, `"sha"` the head you reviewed).'
    )


def task_review_package(
    root: Path,
    state: RunState,
    plan_path: Path,
    spec_path: Path,
    task_id: str,
    base_ref: str,
    git: Git,
) -> Path:
    plan, spec = plan_path.read_text(), spec_path.read_text()
    node = f"{task_id}.task-review"
    sha = git.run(["rev-parse", "HEAD"]).strip()
    anti = _checklist(spec_section(spec, r"^(\d+\.\s*)?anti-goals\b"))
    return _write(root, state, node, [
        ("Diff", _fence(git.run(["diff", f"{base_ref}...HEAD"]))),
        ("Task", plan_section(plan, task_id)),
        ("Global constraints", _body(plan, r"^global constraints$")),
        ("Spec anti-goals", anti or "The spec lists no anti-goals."),
        ("Gate results", _gate_results(state, task_id, sha)),
        ("Earlier findings on this task", _earlier_findings(root, state, task_id)),
        ("Rules", _rules(node, verdict_path(root, state, node), free=False)),
    ])  # fmt: skip


def _review_outcomes(state: RunState) -> str:
    out: list[str] = []
    minors: list[Finding] = []
    for r in state.reviews:
        if not r.node.endswith(".task-review"):
            continue
        line = f"- {r.task} at {r.sha}: {r.result}"
        try:
            minors += [f for f in load_verdict(Path(r.verdict_path)).findings
                       if f.severity == "minor"]  # fmt: skip
        except VerdictError as e:
            line += f" (verdict unreadable: {e})"
        out.append(line)
    text = "\n".join(out)
    return text + ("\n\nDeferred minors:\n\n" + _findings_md(minors) if minors else "")


def _runs(gh: Gh) -> str:
    fields = "databaseId,status,conclusion,headBranch,headSha,createdAt,url"
    raw = gh.run(["run", "list", "--workflow", "build-deploy", "--limit", "20", "--json", fields])
    try:
        runs = json.loads(raw)
    except ValueError:
        return ""
    return "\n".join(
        f"- {r.get('createdAt')} {r.get('headBranch')}@{str(r.get('headSha'))[:7]}: "
        f"{r.get('conclusion') or r.get('status')} {r.get('url')}"
        for r in runs
    )


def _escalations(state: RunState) -> str:
    return "\n".join(f"- {e.at} {e.node}: {e.reason}" for e in state.escalations)


def final_package(
    root: Path,
    state: RunState,
    plan_path: Path,
    spec_path: Path,
    range_: str,
    git: Git,
    gh: Gh,
) -> Path:
    plan, spec = plan_path.read_text(), spec_path.read_text()
    goals = _body(spec, r"^(\d+\.\s*)?goals$")
    anti = _body(spec, r"^(\d+\.\s*)?anti-goals\b")
    spec_text = "\n\n".join(
        part for part in (f"### Goals\n\n{goals}" if goals else "",
                          f"### Anti-goals\n\n{anti}" if anti else "") if part
    ) or "The spec lists no goals or anti-goals."  # fmt: skip
    return _write(root, state, "final-review", [
        ("Range", f"`{range_}`\n\n```\n{git.run(['diff', '--stat', range_]).rstrip()}\n```"),
        ("Review Focus", _body(plan, r"^review focus$")),
        ("Spec goals and anti-goals", spec_text),
        ("Task review outcomes and deferred minors", _review_outcomes(state)),
        ("build-deploy history", _runs(gh)),
        ("Escalations", _escalations(state)),
        ("Rules", _rules("final-review", verdict_path(root, state, "final-review"), free=True)),
    ])  # fmt: skip


def delta_package(
    root: Path, state: RunState, fix_range: str, findings: list[Finding], git: Git
) -> Path:
    node = "delta-review"
    return _write(root, state, node, [
        ("Fix range", f"`{fix_range}`"),
        ("Diff", _fence(git.run(["diff", fix_range]))),
        ("Findings addressed", _findings_md(findings)),
        ("Rules", _rules(node, verdict_path(root, state, node), free=False)),
    ])  # fmt: skip
