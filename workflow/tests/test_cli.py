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
