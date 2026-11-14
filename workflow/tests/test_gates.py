import json
from dataclasses import dataclass
from pathlib import Path

from wf.cli import main
from wf.config import load_project
from wf.gates import areas_touched, changed_specs, run_gates
from wf.github import FakeGit

REPO = Path(__file__).resolve().parents[2]
PROJECT = load_project(REPO / "workflow/project.toml")


@dataclass
class Call:
    cmd: str
    cwd: Path
    env: dict[str, str]


def gate_with(paths, fail_on=None, head="abc123", with_calls=False, task="T1"):
    git = FakeGit(canned={"diff": "\n".join(paths) + "\n", "rev-parse HEAD": head + "\n"})
    calls: list[Call] = []

    def runner(cmd, cwd, env):
        calls.append(Call(cmd, cwd, env))
        return 1 if cmd == fail_on else 0

    rec = run_gates(PROJECT, REPO, task, "origin/main", git, runner)
    return (rec, calls) if with_calls else rec


def test_only_touched_areas_run():
    rec = gate_with(paths=["workflow/src/wf/state.py"])
    assert set(rec.checks) == {f"workflow:{c}" for c in PROJECT.areas["workflow"].commands}
    assert rec.passed and all(rec.checks.values())


def test_areas_touched_matches_by_prefix():
    assert areas_touched(["schema/a.sql", "web/x"], PROJECT) == {"pipeline", "web"}
    assert areas_touched(["docs/a.md", "webby/x"], PROJECT) == set()


def test_changed_specs_are_relative_to_e2e_cwd():
    paths = [
        "web/e2e/stage.spec.ts",
        "web/e2e/sub/a.spec.ts",
        "web/e2e/fixtures.ts",
        "web/src/a.ts",
    ]
    assert changed_specs(paths, PROJECT) == ["e2e/stage.spec.ts", "e2e/sub/a.spec.ts"]


def test_web_change_runs_e2e_and_throttled_repeat_for_changed_specs():
    rec, calls = gate_with(paths=["web/src/x.ts", "web/e2e/stage.spec.ts"], with_calls=True)
    assert rec.checks["e2e"] and rec.checks["e2e:throttled"]
    throttled = [c for c in calls if c.env.get("E2E_CPU_THROTTLE") == "4"]
    assert throttled and "e2e/stage.spec.ts" in throttled[0].cmd
    assert "--repeat-each=3" in throttled[0].cmd
    assert throttled[0].cwd == REPO / "web"


def test_no_throttled_check_without_changed_specs():
    rec = gate_with(paths=["web/src/x.ts"])
    assert rec.checks["e2e"] and "e2e:throttled" not in rec.checks


def test_deleted_specs_are_excluded_from_the_diff():
    git = FakeGit(canned={"diff": "web/src/x.ts\n", "rev-parse HEAD": "h\n"})
    run_gates(PROJECT, REPO, "T1", "origin/main", git, lambda c, d, e: 0)
    diff = next(c for c in git.calls if c[0] == "diff")
    assert "--diff-filter=d" in diff and "origin/main...HEAD" in diff


def test_failure_stops_and_marks_rest_not_run():
    rec = gate_with(paths=["pipeline/src/a.py", "web/src/b.ts"], fail_on="uv run mypy src")
    assert not rec.passed and rec.checks["pipeline:uv run mypy src"] is False
    assert rec.checks["pipeline:uv run ruff check"] is True
    assert all(v is False for k, v in rec.checks.items() if k.startswith("web:"))
    assert rec.checks["e2e"] is False


def test_record_is_keyed_to_head():
    assert gate_with(paths=["workflow/x.py"], head="abc123").sha == "abc123"


def test_cli_gate_appends_record_and_exits_by_result(tmp_path, capsys, monkeypatch):
    graph = str(REPO / "workflow/graph.toml")
    base = ["--root", str(tmp_path), "--graph", graph]
    assert main([*base, "init", "--milestone", "13", "--tasks", "T1"]) == 0
    capsys.readouterr()
    assert main([*base, "gate", "T1", "--milestone", "14"]) == 2
    assert "no run state" in capsys.readouterr().err
    monkeypatch.setattr(
        "wf.cli.SubprocessGit",
        lambda root: FakeGit(canned={"diff": "\n", "rev-parse HEAD": "h1\n"}),
    )
    assert (
        main(
            [
                *base,
                "--project",
                str(REPO / "workflow/project.toml"),
                "gate",
                "T1",
                "--milestone",
                "13",
            ]
        )
        == 0
    )
    out = json.loads(capsys.readouterr().out)
    assert out["passed"] and out["sha"] == "h1"
    state = json.loads((tmp_path / ".workflow/runs/m13/state.json").read_text())
    assert state["gates"][0]["task"] == "T1"
