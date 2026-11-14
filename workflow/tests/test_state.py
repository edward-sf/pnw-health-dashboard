from pathlib import Path

import pytest

from wf.config import load_graph
from wf.state import (
    BudgetExhausted,
    GateRecord,
    ReviewRecord,
    RunStateError,
    clear,
    escalate,
    finish,
    init_run,
    latest_gate,
    latest_review,
    load,
    resume,
    run_dir,
    save,
    start_round,
)

REPO = Path(__file__).resolve().parents[2]
GRAPH = load_graph(REPO / "workflow/graph.toml")
NOW = "2026-11-14T10:00:00Z"


def test_init_then_load_round_trips(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1", "T2"], "docs/tasks.md")
    assert set(s.nodes) >= {"T1.implement", "T2.merge", "final-review", "retro"}
    assert "implement" not in s.nodes
    loaded = load(tmp_path, 13)
    assert loaded.nodes["T1.implement"].status == "pending"
    assert loaded.task_graph == "docs/tasks.md"
    assert loaded == s


def test_init_refuses_existing_run(tmp_path):
    init_run(tmp_path, 13, GRAPH, ["T1"])
    with pytest.raises(RunStateError, match="already exists"):
        init_run(tmp_path, 13, GRAPH, ["T1"])


def test_corrupt_state_is_refused_not_reset(tmp_path):
    init_run(tmp_path, 13, GRAPH, ["T1"])
    (run_dir(tmp_path, 13) / "state.json").write_text('{"milestone": 13, "nod')
    with pytest.raises(RunStateError, match="run state unreadable"):
        load(tmp_path, 13)
    with pytest.raises(RunStateError, match="already exists"):
        init_run(tmp_path, 13, GRAPH, ["T1"])


def test_badly_shaped_state_is_refused(tmp_path):
    init_run(tmp_path, 13, GRAPH, ["T1"])
    (run_dir(tmp_path, 13) / "state.json").write_text('{"milestone": 13}')
    with pytest.raises(RunStateError, match="run state unreadable"):
        load(tmp_path, 13)


def test_missing_state_is_an_error(tmp_path):
    with pytest.raises(RunStateError, match="no run state"):
        load(tmp_path, 13)


def test_save_is_atomic_and_round_trips_records(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    s.gates.append(GateRecord("T1", "aaa", {"web": True}, True, NOW))
    s.reviews.append(ReviewRecord("T1", "aaa", "task-review", "pass", "v.md", NOW))
    s.window = "2026-11-14T15:00:00Z"
    save(tmp_path, s)
    assert not (run_dir(tmp_path, 13) / "state.json.tmp").exists()
    assert load(tmp_path, 13) == s


def test_budget_exhaustion_escalates(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    for _ in range(2):
        start_round(s, "T1.task-review", 2, NOW)
        finish(s, "T1.task-review", "failed", NOW)
    with pytest.raises(BudgetExhausted):
        start_round(s, "T1.task-review", 2, NOW)
    assert s.escalations[-1].node == "T1.task-review"
    assert s.nodes["T1.task-review"].status == "escalated"
    assert s.nodes["T1.task-review"].rounds == 2


def test_start_round_marks_running(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    start_round(s, "T1.implement", 3, NOW)
    rec = s.nodes["T1.implement"]
    assert (rec.status, rec.rounds, rec.started_at) == ("running", 1, NOW)


def test_resume_does_not_spend_a_round(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    start_round(s, "T1.implement", 3, NOW)
    resume(s, "T1.implement", NOW)
    assert s.nodes["T1.implement"].status == "pending"
    assert s.nodes["T1.implement"].rounds == 0
    start_round(s, "T1.implement", 3, NOW)
    assert s.nodes["T1.implement"].rounds == 1


def test_resume_only_applies_to_running_nodes(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    with pytest.raises(RunStateError, match="not running"):
        resume(s, "T1.implement", NOW)


def test_finish_records_status_and_note(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    start_round(s, "T1.implement", 3, NOW)
    finish(s, "T1.implement", "done", "2026-11-14T11:00:00Z", "ok")
    rec = s.nodes["T1.implement"]
    assert (rec.status, rec.finished_at, rec.note) == ("done", "2026-11-14T11:00:00Z", "ok")


def test_unknown_node_is_an_error(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    with pytest.raises(RunStateError, match="unknown node 'T9.implement'"):
        start_round(s, "T9.implement", 3, NOW)


def test_records_are_per_sha(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    s.gates.append(GateRecord("T1", "aaa", {"web": True}, True, NOW))
    s.reviews.append(ReviewRecord("T1", "aaa", "task-review", "pass", "v.md", NOW))
    assert latest_gate(s, "T1", "aaa").passed
    assert latest_gate(s, "T1", "bbb") is None
    assert latest_review(s, "T1", "aaa").result == "pass"
    assert latest_review(s, "T1", "bbb") is None


def test_latest_gate_returns_most_recent(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    s.gates.append(GateRecord("T1", "aaa", {"web": False}, False, NOW))
    s.gates.append(GateRecord("T1", "aaa", {"web": True}, True, NOW))
    assert latest_gate(s, "T1", "aaa").passed


def test_start_round_refuses_non_pending_nodes(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    start_round(s, "T1.implement", 3, NOW)
    with pytest.raises(RunStateError, match="cannot be started"):
        start_round(s, "T1.implement", 3, NOW)  # running
    finish(s, "T1.implement", "done", NOW)
    with pytest.raises(RunStateError, match="cannot be started"):
        start_round(s, "T1.implement", 3, NOW)  # done
    s.nodes["T1.gates"].status = "escalated"
    with pytest.raises(RunStateError, match="cannot be started"):
        start_round(s, "T1.gates", 3, NOW)
    assert s.escalations == []


def test_finish_escalated_records_an_escalation(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    finish(s, "T1.implement", "escalated", NOW, "stuck")
    finish(s, "T1.gates", "escalated", NOW)
    assert [(e.node, e.reason) for e in s.escalations] == [
        ("T1.implement", "stuck"),
        ("T1.gates", "escalated"),
    ]


def test_fix_branch_round_trips_and_old_state_loads_without_it(tmp_path):
    import json

    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    assert s.fix_branch is None
    s.fix_branch = "m13-final-review-fixes"
    save(tmp_path, s)
    assert load(tmp_path, 13).fix_branch == "m13-final-review-fixes"
    path = run_dir(tmp_path, 13) / "state.json"
    raw = json.loads(path.read_text())
    del raw["fix_branch"]  # a run saved before the field existed
    path.write_text(json.dumps(raw))
    assert load(tmp_path, 13).fix_branch is None


def test_bad_fix_branch_is_refused(tmp_path):
    import json

    init_run(tmp_path, 13, GRAPH, ["T1"])
    path = run_dir(tmp_path, 13) / "state.json"
    raw = json.loads(path.read_text())
    raw["fix_branch"] = 7
    path.write_text(json.dumps(raw))
    with pytest.raises(RunStateError, match="unreadable"):
        load(tmp_path, 13)


def test_clear_returns_an_escalated_node_to_pending_with_rounds_reset(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    start_round(s, "T1.implement", 3, NOW)
    escalate(s, "T1.implement", "stuck", NOW)
    clear(s, "T1.implement", "retry with a smaller step")
    rec = s.nodes["T1.implement"]
    assert (rec.status, rec.rounds) == ("pending", 0)
    assert rec.note == "author: retry with a smaller step"
    start_round(s, "T1.implement", 3, NOW)
    assert s.nodes["T1.implement"].rounds == 1


def test_clear_refuses_a_node_that_is_not_escalated(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    with pytest.raises(RunStateError, match="not escalated"):
        clear(s, "T1.implement", "x")
