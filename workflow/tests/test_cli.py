import json
from pathlib import Path

from wf.cli import main

REPO = Path(__file__).resolve().parents[2]


def run(tmp_path, *args):
    graph = str(REPO / "workflow/graph.toml")
    return main(["--root", str(tmp_path), "--graph", graph, *args])


def test_cli_expected_error_is_one_line(tmp_path, capsys):
    assert main(["--root", str(tmp_path), "status", "--milestone", "13"]) == 2
    err = capsys.readouterr().err
    assert err.startswith("wf: ") and "Traceback" not in err and err.count("\n") == 1


def test_cli_lifecycle(tmp_path, capsys):
    assert run(tmp_path, "init", "--milestone", "13", "--tasks", "T1,T2") == 0
    capsys.readouterr()
    assert run(tmp_path, "start", "T1.implement", "--milestone", "13") == 0
    assert json.loads(capsys.readouterr().out)["rounds"] == 1
    assert run(tmp_path, "resume", "T1.implement", "--milestone", "13") == 0
    capsys.readouterr()
    assert run(tmp_path, "start", "T1.implement", "--milestone", "13") == 0
    capsys.readouterr()
    assert run(tmp_path, "finish", "T1.implement", "--milestone", "13", "--status", "done") == 0
    capsys.readouterr()
    assert run(tmp_path, "status", "--milestone", "13") == 0
    state = json.loads(capsys.readouterr().out)
    assert state["nodes"]["T1.implement"]["status"] == "done"
    assert state["nodes"]["T1.implement"]["rounds"] == 2


def test_cli_budget_exhaustion_exits_2_and_escalates(tmp_path, capsys):
    run(tmp_path, "init", "--milestone", "13", "--tasks", "T1")
    for _ in range(2):
        assert run(tmp_path, "start", "T1.task-review", "--milestone", "13") == 0
        run(tmp_path, "finish", "T1.task-review", "--milestone", "13", "--status", "failed")
    capsys.readouterr()
    assert run(tmp_path, "start", "T1.task-review", "--milestone", "13") == 2
    assert "budget" in capsys.readouterr().err
    run(tmp_path, "status", "--milestone", "13")
    state = json.loads(capsys.readouterr().out)
    assert state["nodes"]["T1.task-review"]["status"] == "escalated"


def test_cli_escalate(tmp_path, capsys):
    run(tmp_path, "init", "--milestone", "13", "--tasks", "T1")
    capsys.readouterr()
    assert run(tmp_path, "escalate", "T1.merge", "--milestone", "13", "--reason", "stuck") == 0
    capsys.readouterr()
    run(tmp_path, "status", "--milestone", "13")
    state = json.loads(capsys.readouterr().out)
    assert state["escalations"][0]["reason"] == "stuck"
    assert state["nodes"]["T1.merge"]["status"] == "escalated"


# ---------------------------------------------------------------- package and ingest


def _repo_with_run(tmp_path):
    import shutil
    import subprocess

    from wf.schedule import TaskGraph, TaskNode, write_task_graph

    plan = "docs/plan.md"
    spec = "docs/spec.md"
    (tmp_path / "docs").mkdir()
    shutil.copy(
        REPO / "docs/superpowers/plans/2026-11-13-m11-explorer-redesign.md", tmp_path / plan
    )
    shutil.copy(
        REPO / "docs/superpowers/specs/2026-11-13-m11-explorer-redesign-design.md", tmp_path / spec
    )
    node = TaskNode("T3", 7, "Toolbar", 3, (), (), (), (), "7-toolbar")
    graph = TaskGraph(11, plan, spec, "sha", ("T3",), {"T3": node})
    write_task_graph(tmp_path / "docs/plan.tasks.json", graph)
    git = ["git", "-c", "user.name=t", "-c", "user.email=t@t"]
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run([*git, "-C", str(tmp_path), "add", "."], check=True)
    subprocess.run([*git, "-C", str(tmp_path), "commit", "-qm", "x"], check=True)
    run(
        tmp_path,
        "init",
        "--milestone",
        "11",
        "--tasks",
        "T3",
        "--task-graph",
        "docs/plan.tasks.json",
    )


def test_cli_package_task_review_prints_paths(tmp_path, capsys, monkeypatch):
    _repo_with_run(tmp_path)

    class Gh:
        def run(self, args):
            assert args == ["pr", "view", "5", "--json", "headRefOid"]
            return json.dumps({"headRefOid": "c" * 40})

    monkeypatch.setattr("wf.cli.SubprocessGh", Gh)
    capsys.readouterr()
    assert run(tmp_path, "package", "task-review", "--milestone", "11", "--task", "T3",
               "--base", "HEAD", "--pr", "5") == 0  # fmt: skip
    out = json.loads(capsys.readouterr().out)
    assert out["path"].endswith("packages/T3.task-review.md")
    assert out["verdict_path"].endswith("verdicts/T3.task-review-r1.json")
    text = Path(out["path"]).read_text()
    assert "### Task 3:" in text and 'exactly `"sha": "' + "c" * 40 + '"`' in text


def test_cli_ingest_with_pr_records_and_stale_sha_exits_2(tmp_path, capsys, monkeypatch):
    _repo_with_run(tmp_path)

    class Gh:
        def run(self, args):
            assert args == ["pr", "view", "5", "--json", "headRefOid"]
            return json.dumps({"headRefOid": "head1"})

    monkeypatch.setattr("wf.cli.SubprocessGh", Gh)
    v = tmp_path / "v.json"
    verdict = {
        "node": "T3.task-review",
        "task": "T3",
        "sha": "head1",
        "result": "pass",
        "findings": [],
    }
    v.write_text(json.dumps(verdict))
    capsys.readouterr()
    assert run(tmp_path, "ingest", "T3.task-review", str(v), "--milestone", "11", "--pr", "5") == 0
    assert json.loads(capsys.readouterr().out)["sha"] == "head1"
    verdict["sha"] = "old"
    v.write_text(json.dumps(verdict))
    assert run(tmp_path, "ingest", "T3.task-review", str(v), "--milestone", "11", "--pr", "5") == 2
    err = capsys.readouterr().err
    assert err.startswith("wf: ") and "stale" in err and err.count("\n") == 1
    v.write_text("{}")
    assert run(tmp_path, "ingest", "T3.task-review", str(v), "--milestone", "11", "--pr", "5") == 2
    capsys.readouterr()
    assert run(tmp_path, "status", "--milestone", "11") == 0
    assert len(json.loads(capsys.readouterr().out)["reviews"]) == 1


def test_cli_ingest_finds_the_pr_from_the_tasks_branch(tmp_path, capsys, monkeypatch):
    _repo_with_run(tmp_path)
    seen = []

    class Gh:
        def run(self, args):
            seen.append(args)
            if args[:2] == ["pr", "list"]:
                return json.dumps([{"number": 42}])
            return json.dumps({"headRefOid": "head1"})

    monkeypatch.setattr("wf.cli.SubprocessGh", Gh)
    v = tmp_path / "v.json"
    v.write_text(json.dumps(
        {"node": "T3.task-review", "task": "T3", "sha": "head1", "result": "pass", "findings": []}
    ))  # fmt: skip
    assert run(tmp_path, "ingest", "T3.task-review", str(v), "--milestone", "11") == 0
    assert seen[0] == ["pr", "list", "--head", "7-toolbar", "--json", "number"]
    assert seen[1] == ["pr", "view", "42", "--json", "headRefOid"]


def _merge_setup(tmp_path, monkeypatch, view):
    from wf import cli
    from wf import state as st
    from wf.github import FakeGh
    from wf.schedule import TaskGraph, TaskNode, write_task_graph

    node = TaskNode("T1", 300, "First", 3, (), (), (), (), "300-first")
    write_task_graph(
        tmp_path / "tg.json", TaskGraph(13, "plan.md", "spec.md", "x", ("T1",), {"T1": node})
    )
    run(tmp_path, "init", "--milestone", "13", "--tasks", "T1", "--task-graph", "tg.json")
    state = st.load(tmp_path, 13)
    state.gates.append(st.GateRecord("T1", "aaa", {"web": True}, True, "t"))
    state.reviews.append(st.ReviewRecord("T1", "aaa", "T1.task-review", "pass", "v", "t"))
    st.save(tmp_path, state)
    gh = FakeGh(pr_view={"headRefName": "300-first", "headRefOid": "aaa",
                         "baseRefName": "milestone/m13",
                         "statusCheckRollup": [{"name": "ci", "conclusion": "SUCCESS"}],
                         **view})  # fmt: skip
    monkeypatch.setattr(cli, "SubprocessGh", lambda: gh)
    return gh


def test_cli_check_merge_exit_codes(tmp_path, monkeypatch, capsys):
    _merge_setup(tmp_path, monkeypatch, {})
    capsys.readouterr()
    assert run(tmp_path, "check-merge", "5", "--milestone", "13") == 0
    assert json.loads(capsys.readouterr().out) == {"ok": True, "reasons": []}


def test_cli_check_merge_not_ok_and_unknown_branch(tmp_path, monkeypatch, capsys):
    _merge_setup(tmp_path, monkeypatch, {"headRefOid": "bbb"})
    capsys.readouterr()
    assert run(tmp_path, "check-merge", "5", "--milestone", "13") == 1
    assert json.loads(capsys.readouterr().out)["ok"] is False


def test_cli_check_merge_unknown_branch_is_not_ok(tmp_path, monkeypatch, capsys):
    _merge_setup(tmp_path, monkeypatch, {"headRefName": "other"})
    capsys.readouterr()
    assert run(tmp_path, "check-merge", "5", "--milestone", "13") == 1
    assert "not on any task" in json.loads(capsys.readouterr().out)["reasons"][0]


def test_cli_merge_marks_merge_done(tmp_path, monkeypatch, capsys):
    gh = _merge_setup(tmp_path, monkeypatch, {})
    capsys.readouterr()
    assert run(tmp_path, "merge", "5", "--milestone", "13") == 0
    assert json.loads(capsys.readouterr().out) == {"task": "T1", "sha": "merge-5"}
    assert ["pr", "merge", "5", "--squash", "--delete-branch"] in gh.calls
    run(tmp_path, "status", "--milestone", "13")
    assert json.loads(capsys.readouterr().out)["nodes"]["T1.merge"]["status"] == "done"


def test_cli_merge_refused_exits_2_and_leaves_node_pending(tmp_path, monkeypatch, capsys):
    _merge_setup(tmp_path, monkeypatch, {"headRefOid": "bbb"})
    capsys.readouterr()
    assert run(tmp_path, "merge", "5", "--milestone", "13") == 2
    assert "not merging" in capsys.readouterr().err
    run(tmp_path, "status", "--milestone", "13")
    assert json.loads(capsys.readouterr().out)["nodes"]["T1.merge"]["status"] == "pending"


def test_cli_deploy_watch_exit_codes_and_state(tmp_path, monkeypatch, capsys):
    from wf import cli
    from wf.github import FakeGh

    gh = FakeGh(run_lists=[[{"headSha": "aaa", "status": "completed", "conclusion": "failure"}]])
    monkeypatch.setattr(cli, "SubprocessGh", lambda: gh)
    run(tmp_path, "init", "--milestone", "13", "--tasks", "T1")
    capsys.readouterr()
    code = run(tmp_path, "--project", str(REPO / "workflow/project.toml"), "deploy-watch",
               "T1.deploy-watch", "--milestone", "13", "--sha", "aaa")  # fmt: skip
    assert code == 1
    run(tmp_path, "status", "--milestone", "13")
    out = capsys.readouterr().out
    state = json.loads(out[out.rindex('{\n  "milestone"') :])
    assert state["nodes"]["T1.deploy-watch"]["status"] == "failed"
