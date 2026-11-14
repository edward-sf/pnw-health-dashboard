"""Fill the milestone PR from run state, and post the final-review comments."""

from __future__ import annotations

import re
from pathlib import Path

from wf.github import Gh
from wf.state import Escalation, GateRecord, RunState
from wf.tasks import PlanTask
from wf.verdict import Finding

OUTCOME_DEFAULT = "ask author"


def _fill(template: str, title: str, content: str) -> str:
    """Replace the body of `## <title>`, keeping the heading and its leading HTML comment."""
    pattern = re.compile(
        rf"(^##[ \t]+{re.escape(title)}[ \t]*\n(?:<!--.*?-->[ \t]*\n)?)(.*?)(?=^## |\Z)",
        re.DOTALL | re.MULTILINE,
    )
    if not pattern.search(template):
        return template.rstrip("\n") + f"\n\n## {title}\n{content}\n"
    return pattern.sub(lambda m: f"{m.group(1)}{content}\n\n", template, count=1)


def _latest_gate(state: RunState, task: str) -> GateRecord | None:
    return next((g for g in reversed(state.gates) if g.task == task), None)


def _verification(state: RunState, tasks: list[PlanTask]) -> str:
    lines = []
    for t in tasks:
        gate = _latest_gate(state, t.id)
        if gate is None:
            lines.append(f"- {t.id}: no gate record")
            continue
        checks = ", ".join(f"{n} {'pass' if ok else 'FAIL'}" for n, ok in gate.checks.items())
        verdict = "passed" if gate.passed else "FAILED"
        lines.append(f"- {t.id} at `{gate.sha[:7]}`: gates {verdict} ({checks})")
    return "\n".join(lines) or "No gate records."


def _escalation_log(escalations: list[Escalation]) -> str:
    if not escalations:
        return "No escalations."
    return "\n".join(f"- {e.at} {e.node}: {e.reason}" for e in escalations)


def render_milestone_body(
    state: RunState, tasks: list[PlanTask], issues: dict[str, int], template: str
) -> str:
    """Fill the sections that come from run state; the rest stay for later nodes."""
    ordered = sorted(tasks, key=lambda t: t.number)
    body = template.replace("M<N>", f"M{state.milestone}").replace("m<N>", f"m{state.milestone}")
    listed = [t for t in ordered if t.id in issues]
    body = _fill(
        body,
        "Issue PRs in this milestone",
        "\n".join(f"- {t.id} — {t.title} (#{issues[t.id]})" for t in listed),
    )
    body = _fill(body, "Closes", "\n".join(f"Closes #{issues[t.id]}" for t in listed))
    verification = (
        _verification(state, ordered)
        + "\n\n### Escalation log\n\n"
        + _escalation_log(state.escalations)
    )
    return _fill(body, "Verification", verification)


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_outcomes(findings: list[Finding], outcomes: dict[str, str]) -> str:
    """A table of every final-review finding and what became of it."""
    rows = [
        f"| {_cell(f.id)} | {f.severity} | {_cell(f.title)} | "
        f"{_cell(outcomes.get(f.id, OUTCOME_DEFAULT))} |"
        for f in findings
    ]
    return (
        "\n".join(["| Finding | Severity | Title | Outcome |", "|---|---|---|---|", *rows]) + "\n"
    )


def post_final_review(gh: Gh, pr: int, report: Path) -> None:
    gh.run(["pr", "comment", str(pr), "--body-file", str(report)])


def post_outcomes(gh: Gh, pr: int, text: str) -> None:
    gh.run(["pr", "comment", str(pr), "--body", text])


def mark_ready(gh: Gh, pr: int) -> None:
    gh.run(["pr", "ready", str(pr)])
