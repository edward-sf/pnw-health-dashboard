from pathlib import Path

from wf.github import FakeGh
from wf.milestone_pr import (
    mark_ready,
    post_final_review,
    post_outcomes,
    render_milestone_body,
    render_outcomes,
)
from wf.state import Escalation, GateRecord, RunState
from wf.tasks import PlanTask
from wf.verdict import Finding

REPO = Path(__file__).resolve().parents[2]
TEMPLATE = (REPO / ".github/PULL_REQUEST_TEMPLATE/milestone.md").read_text()
NOW = "2026-11-14T10:00:00Z"


def task(id, title):
    return PlanTask(id, title, 3, (), (), ())


TASKS = [task("T2", "Second"), task("T1", "First")]
STATE = RunState(milestone=13, nodes={})
STATE.gates += [
    GateRecord("T1", "a" * 40, {"web": False}, False, NOW),
    GateRecord("T1", "b" * 40, {"web": True, "e2e": True}, True, NOW),
]
STATE.escalations.append(Escalation("T2.task-review", "budget of 2 rounds exhausted", NOW))


def f(id, severity):
    return Finding(id, severity, f"title {id}", None, None, "d")


def test_body_lists_every_issue_with_closes():
    body = render_milestone_body(STATE, TASKS, {"T1": 300, "T2": 301}, TEMPLATE)
    assert "Closes #300" in body and "Closes #301" in body
    assert body.index("T1 — First (#300)") < body.index("T2 — Second (#301)")
    assert "Closes #\n" not in body and "M<N>" not in body and "m<N>" not in body
    assert "# M13" in body


def test_body_verification_uses_latest_gate_and_logs_escalations():
    body = render_milestone_body(STATE, TASKS, {"T1": 300, "T2": 301}, TEMPLATE)
    assert "T1 at `bbbbbbb`: gates passed (web pass, e2e pass)" in body
    assert "aaaaaaa" not in body and "T2: no gate record" in body
    assert "T2.task-review: budget of 2 rounds exhausted" in body


def test_body_leaves_author_sections_and_is_idempotent():
    once = render_milestone_body(STATE, TASKS, {"T1": 300, "T2": 301}, TEMPLATE)
    for heading in ("## Summary", "## Deviations from plan/spec", "## Review guide",
                    "## Milestone exit criteria (from roadmap)"):  # fmt: skip
        assert heading in once
    assert render_milestone_body(STATE, TASKS, {"T1": 300, "T2": 301}, once) == once


def test_outcomes_table():
    t = render_outcomes([f("C1", "critical"), f("M2", "minor"), f("I3", "important")],
                        {"C1": "fixed in #410", "M2": "deferred to #411"})  # fmt: skip
    assert "| C1 |" in t and "fixed in #410" in t and "deferred to #411" in t
    assert "| I3 | important | title I3 | ask author |" in t


def test_posts_use_comment_and_ready_but_never_merge_or_approve():
    gh = FakeGh()
    post_final_review(gh, 9, Path("report.md"))
    post_outcomes(gh, 9, "table")
    mark_ready(gh, 9)
    assert gh.calls == [
        ["pr", "comment", "9", "--body-file", "report.md"],
        ["pr", "comment", "9", "--body", "table"],
        ["pr", "ready", "9"],
    ]


def test_issue_lines_use_pr_numbers_when_known_and_fall_back_per_task():
    body = render_milestone_body(STATE, TASKS, {"T1": 300, "T2": 301}, TEMPLATE, {"T1": 410})
    assert "- #410 — M13.T1 First (closes #300)" in body
    assert "- T2 — Second (#301)" in body
    assert body.index("#410") < body.index("T2 — Second")
    assert "Closes #300" in body and "Closes #301" in body


def test_issue_lines_all_prs_known():
    body = render_milestone_body(
        STATE, TASKS, {"T1": 300, "T2": 301}, TEMPLATE, {"T1": 410, "T2": 411}
    )
    assert "- #411 — M13.T2 Second (closes #301)" in body
