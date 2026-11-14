import pytest

from wf.github import CommandError, FakeGh
from wf.merge import check_merge, merge_task
from wf.state import GateRecord, ReviewRecord, RunState

NOW = "2026-11-14T10:00:00Z"


def state_with(gates=(), reviews=()):
    s = RunState(milestone=13, nodes={})
    for task, sha, passed in gates:
        s.gates.append(GateRecord(task, sha, {"web": passed}, passed, NOW))
    for task, sha, result in reviews:
        s.reviews.append(ReviewRecord(task, sha, f"{task}.task-review", result, "v.json", NOW))
    return s


def passing_state(sha):
    return state_with(gates=[("T1", sha, True)], reviews=[("T1", sha, "pass")])


def ci(conclusion):
    return {"name": "ci", "conclusion": conclusion}


def view(sha, base="milestone/m13", ci_state="SUCCESS", rollup=None):
    return {
        "headRefOid": sha,
        "baseRefName": base,
        "statusCheckRollup": [ci(ci_state)] if rollup is None else rollup,
    }


def test_all_records_present_is_ok():
    c = check_merge(passing_state("aaa"), "T1", 5, FakeGh(pr_view=view("aaa")))
    assert c.ok and c.reasons == []


def test_new_commit_after_review_blocks_merge():  # Review Focus 3
    s = passing_state("aaa")
    gh = FakeGh(pr_view=view("bbb"))
    c = check_merge(s, "T1", 5, gh)
    assert (
        not c.ok and any("gate" in r for r in c.reasons) and any("review" in r for r in c.reasons)
    )
    with pytest.raises(CommandError):
        merge_task(s, "T1", 5, gh)
    assert not any(call[:2] == ["pr", "merge"] for call in gh.calls)


def test_red_ci_blocks_merge():
    gh = FakeGh(pr_view=view("aaa", ci_state="FAILURE"))
    assert not check_merge(passing_state("aaa"), "T1", 5, gh).ok


def test_missing_ci_check_blocks_merge():
    gh = FakeGh(pr_view=view("aaa", rollup=[{"name": "web", "conclusion": "SUCCESS"}]))
    c = check_merge(passing_state("aaa"), "T1", 5, gh)
    assert not c.ok and any("ci" in r for r in c.reasons)


def test_status_context_ci_is_read():
    gh = FakeGh(pr_view=view("aaa", rollup=[{"context": "ci", "state": "SUCCESS"}]))
    assert check_merge(passing_state("aaa"), "T1", 5, gh).ok


def test_main_base_is_refused_even_with_records():
    c = check_merge(passing_state("aaa"), "T1", 5, FakeGh(pr_view=view("aaa", base="main")))
    assert not c.ok and any("main" in r for r in c.reasons)


def test_later_pass_after_failure_counts_and_later_failure_does_not():
    gh = FakeGh(pr_view=view("aaa"))
    recovered = state_with(
        gates=[("T1", "aaa", False), ("T1", "aaa", True)],
        reviews=[("T1", "aaa", "findings"), ("T1", "aaa", "pass")],
    )
    assert check_merge(recovered, "T1", 5, gh).ok
    regressed = state_with(
        gates=[("T1", "aaa", True), ("T1", "aaa", False)],
        reviews=[("T1", "aaa", "pass"), ("T1", "aaa", "findings")],
    )
    c = check_merge(regressed, "T1", 5, gh)
    assert not c.ok and len(c.reasons) == 2


def test_merge_squashes_and_deletes_branch():
    gh = FakeGh(pr_view=view("aaa"))
    sha = merge_task(passing_state("aaa"), "T1", 5, gh)
    assert [
        "pr",
        "merge",
        "5",
        "--squash",
        "--delete-branch",
        "--match-head-commit",
        "aaa",
    ] in gh.calls
    assert sha == "merge-5"


def test_merge_without_a_merge_commit_is_an_error():
    gh = FakeGh(pr_view=view("aaa"), canned={"pr view 5 --json mergeCommit": "{}"})
    with pytest.raises(CommandError, match="no merge commit"):
        merge_task(passing_state("aaa"), "T1", 5, gh)


def test_garbled_pr_view_is_a_command_error():
    with pytest.raises(CommandError):
        check_merge(passing_state("aaa"), "T1", 5, FakeGh(canned={"pr view": "not json"}))


def fix_state(sha, review_node="delta-review", result="pass", gate_task="batched-fix"):
    s = RunState(milestone=13, nodes={}, fix_branch="m13-final-review-fixes")
    s.gates.append(GateRecord(gate_task, sha, {"web": True}, True, NOW))
    s.reviews.append(ReviewRecord(review_node, sha, review_node, result, "v.json", NOW))
    return s


def test_fix_pr_merges_on_its_gate_and_delta_review():
    c = check_merge(fix_state("aaa"), "batched-fix", 9, FakeGh(pr_view=view("aaa")))
    assert c.ok and c.reasons == []


def test_fix_pr_needs_a_passing_delta_review_for_its_head():
    gh = FakeGh(pr_view=view("aaa"))
    findings = check_merge(fix_state("aaa", result="findings"), "batched-fix", 9, gh)
    assert not findings.ok and any("review" in r for r in findings.reasons)
    other = check_merge(fix_state("aaa", review_node="final-review"), "batched-fix", 9, gh)
    assert not other.ok and any("delta-review" in r for r in other.reasons)
    stale = check_merge(fix_state("aaa"), "batched-fix", 9, FakeGh(pr_view=view("bbb")))
    assert not stale.ok and any("gate" in r for r in stale.reasons)
