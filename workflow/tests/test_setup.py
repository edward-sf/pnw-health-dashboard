import json
from pathlib import Path

import pytest

from wf.cli import main
from wf.config import load_graph, load_project
from wf.github import FakeGh, FakeGit
from wf.schedule import load_task_graph
from wf.setup import setup_milestone, work_order
from wf.state import load
from wf.tasks import PlanError, check_plan_file, parse_plan_tasks

REPO = Path(__file__).resolve().parents[2]
PROJECT = load_project(REPO / "workflow/project.toml")
GRAPH = load_graph(REPO / "workflow/graph.toml")

GOOD = """# M13 Branding Implementation Plan

**Goal:** Give the site a brand.

```toml workflow-tasks
[[task]]
id = "T1"
title = "First"
steps = 2
depends_on = []
files = ["a.py"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T2"
title = "Second"
steps = 1
depends_on = ["T1"]
files = ["a.py"]
labels = ["area:web"]
```

### Task 1: First

Make the first thing.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Implement it**

### Task 2: Second

- [ ] **Step 1: Do it**
"""

BAD = GOOD.replace('depends_on = ["T1"]', "depends_on = []")


def write(tmp_path, text):
    plan = tmp_path / PROJECT.plans_dir / "2026-11-20-m13-branding.md"
    plan.parent.mkdir(parents=True, exist_ok=True)
    plan.write_text(text)
    return plan


def good_plan(tmp_path):
    return write(tmp_path, GOOD)


def bad_plan(tmp_path):
    return write(tmp_path, BAD)


def spec(tmp_path):
    s = tmp_path / PROJECT.specs_dir / "2026-11-20-m13-branding-design.md"
    s.parent.mkdir(parents=True, exist_ok=True)
    s.write_text("# spec\n")
    return s


def run(tmp_path, gh=None, git=None, plan=None):
    return setup_milestone(
        PROJECT, tmp_path, 13, plan or good_plan(tmp_path), spec(tmp_path),
        gh or FakeGh(), git or FakeGit(), GRAPH,
    )  # fmt: skip


def test_bad_plan_makes_no_calls(tmp_path):
    gh, git = FakeGh(), FakeGit()
    with pytest.raises(PlanError, match="T2 and T1 both change a.py"):
        run(tmp_path, gh, git, bad_plan(tmp_path))
    assert gh.calls == [] and git.calls == []


def test_setup_is_idempotent(tmp_path):
    gh = FakeGh(existing_issues={"M13.T1 First": 300}, milestones=["M13 - Branding"])
    git = FakeGit(branches={"milestone/m13"})
    r = run(tmp_path, gh, git)
    assert r.issues["T1"] == 300
    assert not any(c[:2] == ["issue", "create"] and "M13.T1 First" in c for c in gh.calls)
    assert not any(c[0] == "push" and "refs/heads/milestone/m13" in c[-1] for c in git.calls)
    assert not any(c[0] == "api" and "--method" in c for c in gh.calls)


def test_setup_twice_creates_nothing_new(tmp_path):
    gh, git = FakeGh(), FakeGit()
    first = run(tmp_path, gh, git)
    n_issue_creates = sum(c[:2] == ["issue", "create"] for c in gh.calls)
    git2 = FakeGit(branches=git.branches, canned={"status --porcelain": ""})
    second = run(tmp_path, gh, git2)
    assert second.issues == first.issues and n_issue_creates == 2
    assert sum(c[:2] == ["issue", "create"] for c in gh.calls) == 2
    assert not any(c[0] == "commit" for c in git2.calls)
    assert second.plan_pr == first.plan_pr and second.milestone_pr == first.milestone_pr


def test_setup_writes_task_graph_with_issues(tmp_path):
    run(tmp_path, FakeGh(next_issue=300))
    g = load_task_graph(next((tmp_path / PROJECT.plans_dir).glob("*.tasks.json")))
    assert g.tasks["T1"].issue == 300 and g.tasks["T1"].branch.startswith("300-")
    assert g.tasks["T1"].blocks == ("T2",)
    assert g.order == ("T1", "T2") and g.milestone == 13
    assert g.plan == f"{PROJECT.plans_dir}/2026-11-20-m13-branding.md"


def test_stale_task_graph_is_reported(tmp_path):
    plan = good_plan(tmp_path)
    run(tmp_path, plan=plan)
    assert check_plan_file(plan) == []
    plan.write_text(plan.read_text() + "\n<!-- edited -->\n")
    assert any("task graph is stale" in m for m in check_plan_file(plan))


def test_issue_body_links_plan_section(tmp_path):
    gh = FakeGh()
    run(tmp_path, gh)
    body = gh.created_issue_body("M13.T1 First")
    assert body == (
        "### Plan section\n"
        f"https://github.com/{PROJECT.repo}/blob/milestone/m13/{PROJECT.plans_dir}"
        "/2026-11-20-m13-branding.md — Task 1\n\n"
        "### Goal\nMake the first thing.\n\n"
        f"Spec: `{PROJECT.specs_dir}/2026-11-20-m13-branding-design.md`\n\n"
        "### Acceptance criteria\n- [ ] Write the failing test\n- [ ] Implement it"
    )
    assert "Task 2" in gh.created_issue_body("M13.T2 Second")
    create = next(c for c in gh.calls if c[:2] == ["issue", "create"])
    assert create.count("--label") == 2 and "area:web" in create


def test_goal_falls_back_to_title(tmp_path):
    gh = FakeGh()
    run(tmp_path, gh)
    assert "### Goal\nSecond\n" in gh.created_issue_body("M13.T2 Second")


def test_roadmap_gets_m11_style_section(tmp_path):
    roadmap = tmp_path / PROJECT.roadmap
    roadmap.parent.mkdir(parents=True, exist_ok=True)
    roadmap.write_text("# Roadmap\n\n## M12 — Old\nx\n\n## Backlog\n- thing\n")
    run(tmp_path, FakeGh(next_issue=300))
    text = roadmap.read_text()
    assert text.index("## M12") < text.index("## M13 — Branding") < text.index("## Backlog")
    assert "**Goal:** Give the site a brand." in text
    assert (
        "Plan: `2026-11-20-m13-branding.md`. Spec: `../specs/2026-11-20-m13-branding-design.md`."
        in text
    )
    assert "- M13.T1 #300 First\n- M13.T2 #301 Second" in text
    assert "Work order: T1; T2 after T1." in text
    run(tmp_path, FakeGh(next_issue=300))
    assert roadmap.read_text().count("## M13") == 1


def test_work_order_groups_same_dependencies():
    from wf.tasks import PlanTask

    def t(i, d=()):
        return PlanTask(i, i, 1, tuple(d), (), ())

    ts = [t("T1"), t("T2", ["T1"]), t("T3", ["T2"]), t("T4", ["T1"]), t("T5", ["T3", "T4"])]
    assert work_order(ts, ["T1", "T2", "T4", "T3", "T5"]) == (
        "Work order: T1; T2 and T4 after T1; T3 after T2; T5 after T3 and T4."
    )


def test_git_and_pr_flow(tmp_path):
    gh, git = FakeGh(next_issue=300), FakeGit()
    r = run(tmp_path, gh, git)
    assert r.branch == "milestone/m13" and r.issues == {"T1": 300, "T2": 301}
    assert (r.plan_pr, r.milestone_pr) == (302, 303)
    g = [c[:2] for c in git.calls]
    assert ["push", "origin"] in g and ["switch", "-C"] in g and ["commit", "-m"] in g
    assert ["push", "origin", "origin/main:refs/heads/milestone/m13"] in git.calls
    assert ["pr", "merge", "302", "--repo", PROJECT.repo, "--squash"] in gh.calls
    ms = next(c for c in gh.calls if c[:2] == ["pr", "create"] and "--draft" in c)
    assert ms[ms.index("--template") + 1] == "milestone.md" and "main" in ms
    assert ms.index("--draft") < ms.index("--template")
    assert any(c[0] == "api" and "title=M13 - Branding" in c for c in gh.calls)


def test_setup_inits_run_state_with_task_graph(tmp_path):
    run(tmp_path)
    state = load(tmp_path, 13)
    assert set(state.nodes) >= {"T1.implement", "T2.implement", "final-review"}
    assert state.task_graph.endswith("2026-11-20-m13-branding.tasks.json")
    assert (tmp_path / state.task_graph).exists()


def test_canned_outputs_by_prefix():
    gh = FakeGh(canned={"pr view": '{"a": 1}', "pr view 7": '{"a": 7}'})
    assert gh.run(["pr", "view", "5"]) == '{"a": 1}'
    assert gh.run(["pr", "view", "7", "--json", "x"]) == '{"a": 7}'


def test_cli_check_plan(tmp_path, capsys):
    plan = good_plan(tmp_path)
    assert main(["check-plan", str(plan)]) == 0
    assert json.loads(capsys.readouterr().out) == {"problems": []}
    bad = bad_plan(tmp_path)
    assert main(["check-plan", str(bad)]) == 2
    assert "a.py" in json.loads(capsys.readouterr().out)["problems"][0]
    plan.write_text("# nothing\n")
    assert main(["check-plan", str(plan)]) == 2
    assert capsys.readouterr().err.startswith("wf: plan has no workflow-tasks block")


def test_parse_matches_fixture():
    assert [t.id for t in parse_plan_tasks(GOOD)] == ["T1", "T2"]
