from pathlib import Path

import pytest

from wf.tasks import (
    PlanError,
    PlanTask,
    check_plan,
    check_plan_file,
    parse_plan_tasks,
    plan_blob_sha,
    plan_section,
    section_goal,
    section_steps,
    topo_order,
)

REPO = Path(__file__).resolve().parents[2]
M12_PLAN = "docs/superpowers/plans/2026-11-14-m12-workflow-engineering.md"


def pt(id, depends_on=(), files=(), steps=3):
    return PlanTask(id, f"title {id}", steps, tuple(depends_on), tuple(files), ("area:infra",))


def test_parses_this_plans_own_block():
    tasks = parse_plan_tasks((REPO / M12_PLAN).read_text())
    assert [t.id for t in tasks][:3] == ["T1", "T2", "T3"]
    assert check_plan(tasks) == []


def test_this_plan_has_a_section_for_every_task():
    text = (REPO / M12_PLAN).read_text()
    for t in parse_plan_tasks(text):
        assert plan_section(text, t.id).startswith(f"### Task {t.number}:")


def test_missing_block():
    with pytest.raises(PlanError, match="no workflow-tasks block"):
        parse_plan_tasks("# Plan\n")


def test_ignores_other_toml_fences():
    with pytest.raises(PlanError, match="no workflow-tasks block"):
        parse_plan_tasks('```toml\n[[task]]\nid = "T1"\n```\n')


def test_bad_toml_and_bad_fields_are_plan_errors():
    with pytest.raises(PlanError, match="not valid TOML"):
        parse_plan_tasks("```toml workflow-tasks\n[[task\n```\n")
    with pytest.raises(PlanError, match="'steps'"):
        parse_plan_tasks('```toml workflow-tasks\n[[task]]\nid = "T1"\ntitle = "x"\n```\n')


def test_problems_are_all_listed():
    ts = [
        pt("T1", files=["a.py"]),
        pt("T2", files=["a.py"]),
        pt("T3", depends_on=["T9"]),
        pt("T4", depends_on=["T5"]),
        pt("T5", depends_on=["T4"]),
        pt("T1"),
    ]
    msgs = check_plan(ts)
    assert any("T2" in m and "T1" in m and "a.py" in m for m in msgs)
    assert any("unknown" in m and "T9" in m for m in msgs)
    assert any("cycle" in m for m in msgs)
    assert any("duplicate" in m and "T1" in m for m in msgs)


def test_transitive_dependency_covers_overlap():
    ts = [
        pt("T1", files=["a.py"]),
        pt("T2", depends_on=["T1"]),
        pt("T3", depends_on=["T2"], files=["a.py"]),
    ]
    assert check_plan(ts) == []


def test_topo_order_keeps_plan_order_for_ties():
    ts = [pt("T1"), pt("T4", ["T1"]), pt("T3", ["T2"]), pt("T2", ["T1"])]
    assert topo_order(ts) == ["T1", "T4", "T2", "T3"]


PLAN = """# Plan

### Task 1: First

Does the first thing.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Implement.** Details here.

### Task 2: Second

**Files:**
- x

- [ ] **Step 1: Only step**

## Later
"""


def test_plan_section_stops_at_next_heading():
    s = plan_section(PLAN, "T1")
    assert s.startswith("### Task 1: First") and "Task 2" not in s
    assert "Later" not in plan_section(PLAN, "T2")
    with pytest.raises(PlanError, match="Task 9"):
        plan_section(PLAN, "T9")


def test_section_steps_and_goal():
    assert section_steps(plan_section(PLAN, "T1")) == ["Write the failing test", "Implement."]
    assert section_goal(plan_section(PLAN, "T1"), "fallback") == "Does the first thing."
    assert section_goal(plan_section(PLAN, "T2"), "fallback") == "fallback"


def test_plan_blob_sha_matches_git_hash_object():
    assert plan_blob_sha(b"hello\n") == "ce013625030ba8dba906f756967f9e9ca394464a"


def test_check_plan_file_flags_missing_section(tmp_path):
    plan = tmp_path / "p.md"
    plan.write_text('```toml workflow-tasks\n[[task]]\nid = "T4"\ntitle = "x"\nsteps = 1\n```\n')
    assert any("no '### Task 4:' section" in m for m in check_plan_file(plan))
