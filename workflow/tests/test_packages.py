import json
from pathlib import Path

from wf.config import load_graph, load_project
from wf.github import FakeGh, FakeGit
from wf.packages import (
    delta_package,
    final_package,
    spec_section,
    task_review_package,
    verdict_path,
)
from wf.state import GateRecord, ReviewRecord, init_run
from wf.verdict import Finding

REPO = Path(__file__).resolve().parents[2]
GRAPH = load_graph(REPO / "workflow/graph.toml")
PROJECT = load_project(REPO / "workflow/project.toml")
M11_PLAN = REPO / "docs/superpowers/plans/2026-11-13-m11-explorer-redesign.md"
M11_SPEC = REPO / "docs/superpowers/specs/2026-11-13-m11-explorer-redesign-design.md"
M12_SPEC = REPO / "docs/superpowers/specs/2026-11-14-m12-workflow-engineering-design.md"
NOW = "2026-11-14T10:00:00Z"
HEAD = "a" * 40


def make_state(tmp_path):
    return init_run(tmp_path, 11, GRAPH, ["T3", "T4"])


def write_verdict(tmp_path, name, findings, node="T3.task-review", sha="s1"):
    p = tmp_path / name
    result = "findings" if findings else "pass"
    p.write_text(json.dumps(
        {"node": node, "task": "T3", "sha": sha, "result": result, "findings": findings}
    ))  # fmt: skip
    return p


def finding(id, severity, title="a title"):
    return {"id": id, "severity": severity, "title": title, "file": "x.ts", "line": 9,
            "detail": "the detail"}  # fmt: skip


def test_spec_section_reads_m11_bold_labels():
    spec = M11_SPEC.read_text()
    anti = spec_section(spec, r"^anti-goals")
    assert "The map moves or resizes when the panel opens" in anti
    assert "Map zoom or pan" not in anti and "## 2." not in anti
    goals = spec_section(spec, r"^goals$")
    assert "Dark mode." in goals and "Anti-goals" not in goals and "Map zoom" not in goals


def test_spec_section_reads_m12_heading_and_labels():
    spec = M12_SPEC.read_text()
    anti = spec_section(spec, r"^anti-goals")
    assert "Weaker final review" in anti and "Lost authority" in anti
    assert "### 5.4" not in anti and "Approaches considered" not in anti
    whole = spec_section(spec, r"goals, non-goals, anti-goals")
    assert "Mechanical nodes are deterministic" in whole and "Lost authority" in whole


def test_spec_section_stops_at_same_or_higher_heading():
    text = "# A\nx\n## B\nb1\n### C\nc1\n## D\nd1\n"
    assert spec_section(text, "^B$") == "b1\n### C\nc1\n"
    assert spec_section(text, "^nothing$") == ""


def test_task_package_has_its_sections(tmp_path):
    git = FakeGit(canned={"diff": "DIFF"})
    p = task_review_package(
        tmp_path, make_state(tmp_path), M11_PLAN, M11_SPEC, "T3", "8960663", git, HEAD
    )
    text = p.read_text()
    assert p == tmp_path / ".workflow/runs/m11/packages/T3.task-review.md"
    for h in ["## Diff", "## Task", "## Global constraints", "## Spec anti-goals",
              "## Gate results", "## Earlier findings on this task", "## Rules"]:  # fmt: skip
        assert h in text
    assert "DIFF" in text
    assert "### Task 3:" in text and "### Task 4:" not in text
    anti = text.split("## Spec anti-goals")[1].split("## Gate results")[0]
    assert "- [ ] The map moves or resizes" in anti and anti.count("- [ ]") == 4
    assert "No browser" not in text and "**No product change.**" not in text
    assert "Do not explore beyond this package" in text
    assert "verdicts/T3.task-review-r1.json" in text and "verdict.schema.json" in text


def test_task_package_global_constraints_come_from_the_plan(tmp_path):
    text = task_review_package(
        tmp_path, make_state(tmp_path), M11_PLAN, M11_SPEC, "T3", "b", FakeGit(), HEAD
    ).read_text()
    plan = M11_PLAN.read_text()
    first = plan.split("## Global Constraints")[1].split("\n\n")[1].splitlines()[0]
    assert first in text.split("## Global constraints")[1].split("## Spec anti-goals")[0]
    assert "File map" not in text


def test_task_package_without_anti_goals_says_so(tmp_path):
    spec = tmp_path / "spec.md"
    spec.write_text("# Spec\n\nNothing here.\n")
    text = task_review_package(
        tmp_path, make_state(tmp_path), M11_PLAN, spec, "T3", "b", FakeGit(), HEAD
    ).read_text()
    assert "The spec lists no anti-goals." in text


def test_task_package_gate_results_follow_the_head(tmp_path):
    s = make_state(tmp_path)
    s.gates.append(GateRecord("T3", "h1", {"web:npm test": True, "e2e": False}, False, NOW))
    git = FakeGit(canned={"rev-parse HEAD": "h1\n"})
    text = task_review_package(tmp_path, s, M11_PLAN, M11_SPEC, "T3", "b", git, HEAD).read_text()
    gates = text.split("## Gate results")[1].split("## Earlier")[0]
    assert "FAILED" in gates and "pass: web:npm test" in gates and "FAIL: e2e" in gates
    stale = FakeGit(canned={"rev-parse HEAD": "h2\n"})
    text = task_review_package(tmp_path, s, M11_PLAN, M11_SPEC, "T3", "b", stale, HEAD).read_text()
    assert "No gate record for T3 at h2" in text


def test_earlier_findings_come_from_every_earlier_review(tmp_path):
    s = make_state(tmp_path)
    v1 = write_verdict(tmp_path, "v1.json", [finding("I1", "important", "first problem")])
    v2 = write_verdict(tmp_path, "v2.json", [finding("M1", "minor", "second problem")], sha="s2")
    gone = tmp_path / "gone.json"
    other = write_verdict(tmp_path, "v3.json", [finding("I9", "important", "T4 problem")])
    for task, sha, path in [
        ("T3", "s1", v1),
        ("T3", "s2", v2),
        ("T3", "s3", gone),
        ("T4", "s1", other),
    ]:
        s.reviews.append(ReviewRecord(task, sha, f"{task}.task-review", "findings", str(path), NOW))
    text = task_review_package(
        tmp_path, s, M11_PLAN, M11_SPEC, "T3", "b", FakeGit(), HEAD
    ).read_text()
    earlier = text.split("## Earlier findings on this task")[1].split("## Rules")[0]
    assert "first problem" in earlier and "second problem" in earlier
    assert "T4 problem" not in earlier
    assert "skipped an earlier review at s3" in earlier
    assert "verdicts/T3.task-review-r4.json" in text  # three earlier rounds recorded


def test_final_package_does_not_fence_the_reviewer(tmp_path):
    text = final_package(
        tmp_path,
        make_state(tmp_path),
        M11_PLAN,
        M11_SPEC,
        "8960663..544bbf2",
        FakeGit(),
        FakeGh(),
        PROJECT,
    ).read_text()
    assert "Review Focus" in text and "free access" in text
    assert "head start, not a fence" in text and "Do not explore beyond" not in text


def test_final_package_sections_and_content(tmp_path):
    s = make_state(tmp_path)
    v = write_verdict(tmp_path, "v.json", [finding("M1", "minor", "defer me")])
    s.reviews.append(ReviewRecord("T3", "s1", "T3.task-review", "findings", str(v), NOW))
    from wf.state import Escalation

    s.escalations.append(Escalation("T4.implement", "budget spent", NOW))
    runs = json.dumps([{"createdAt": "d", "headBranch": "milestone/m11", "headSha": "abcdef123",
                        "conclusion": "failure", "url": "http://run/1"}])  # fmt: skip
    git = FakeGit(canned={"diff --stat": " web/a.ts | 2 +-\n"})
    gh = FakeGh(canned={"run list": runs})
    text = final_package(
        tmp_path, s, M11_PLAN, M11_SPEC, "8960663..544bbf2", git, gh, PROJECT
    ).read_text()
    for h in ["## Range", "## Review Focus", "## Spec goals and anti-goals",
              "## Task review outcomes and deferred minors", "## build-deploy history",
              "## Escalations", "## Rules"]:  # fmt: skip
        assert h in text
    assert ["diff", "--stat", "8960663..544bbf2"] in git.calls
    assert "web/a.ts | 2" in text
    assert "Dark mode." in text and "The map moves or resizes" in text
    assert "defer me" in text and "T3 at s1: findings" in text
    assert "milestone/m11@abcdef1: failure" in text
    assert "T4.implement: budget spent" in text
    assert "**No product change.**" not in text.split("## Review Focus")[1].split("## Spec")[0]


def test_final_package_review_focus_is_the_plans_list(tmp_path):
    text = final_package(
        tmp_path, make_state(tmp_path), M11_PLAN, M11_SPEC, "a..b", FakeGit(), FakeGh(), PROJECT
    ).read_text()
    focus = M11_PLAN.read_text().split("## Review Focus")[1].split("\n## ")[0].strip()
    assert focus.splitlines()[0] in text


def test_delta_package(tmp_path):
    s = make_state(tmp_path)
    fs = [Finding("I1", "important", "bad thing", "x.ts", 9, "the detail")]
    git = FakeGit(canned={"diff": "FIXDIFF"})
    p = delta_package(tmp_path, s, "a..b", fs, git)
    text = p.read_text()
    assert p == tmp_path / ".workflow/runs/m11/packages/delta-review.md"
    assert ["diff", "a..b"] in git.calls and "FIXDIFF" in text
    assert "**I1** [important] bad thing (x.ts:9): the detail" in text
    assert "Do not explore beyond this package" in text
    assert verdict_path(tmp_path, s, "delta-review").name in text


def test_final_package_asks_gh_for_the_deploy_workflow_on_the_milestone_branch(tmp_path):
    gh = FakeGh()
    final_package(
        tmp_path, make_state(tmp_path), M11_PLAN, M11_SPEC, "a..b", FakeGit(), gh, PROJECT
    )
    runs = [c for c in gh.calls if c[:2] == ["run", "list"]]
    assert len(runs) == 1
    argv = runs[0]
    assert argv[argv.index("--workflow") + 1] == "build-deploy.yml"
    assert argv[argv.index("--branch") + 1] == "milestone/m11"


def test_every_package_states_the_sha_the_verdict_must_carry(tmp_path):
    s = make_state(tmp_path)
    want = 'write exactly `"sha": "{}"`'
    task = task_review_package(tmp_path, s, M11_PLAN, M11_SPEC, "T3", "b", FakeGit(), HEAD)
    assert want.format(HEAD) in task.read_text()
    git = FakeGit(canned={"rev-parse HEAD": "f" * 40 + "\n"})
    final = final_package(tmp_path, s, M11_PLAN, M11_SPEC, "a..b", git, FakeGh(), PROJECT)
    assert want.format("f" * 40) in final.read_text()
    delta = delta_package(tmp_path, s, "a..b", [], git)
    assert want.format("f" * 40) in delta.read_text()
