"""The committed Claude Code hooks, run as Claude Code runs them: JSON on stdin, exit code out."""

from __future__ import annotations

import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
HOOKS = REPO / ".claude/hooks"
MERGE = "gh pr merge 5 --squash"


def bash(command: str) -> dict:
    return {"tool_name": "Bash", "tool_input": {"command": command}}


def run_hook(name: str, payload: dict, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(HOOKS / name)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env={**os.environ, **(env or {})},
    )


def _script(path: Path, body: str) -> None:
    path.write_text("#!/usr/bin/env bash\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


@pytest.fixture
def stubs(tmp_path):
    """A project dir plus stub `gh` and `uv` first on PATH.

    `gh` prints $GH_BASE as the PR's base branch. `uv` logs its arguments, then prints $UV_OUT
    and exits $UV_EXIT.
    """
    bindir = tmp_path / "bin"
    bindir.mkdir()
    project = tmp_path / "project"
    project.mkdir()
    _script(bindir / "gh", 'echo "${GH_BASE:-milestone/m13}"\n')
    _script(bindir / "uv", 'echo "$*" >> "$UV_LOG"\necho "${UV_OUT:-}"\nexit "${UV_EXIT:-0}"\n')
    return {
        "env": {
            "PATH": f"{bindir}:{os.environ['PATH']}",
            "CLAUDE_PROJECT_DIR": str(project),
            "UV_LOG": str(tmp_path / "uv.log"),
        },
        "project": project,
        "log": tmp_path / "uv.log",
    }


def _env(stubs, **extra):
    return {**stubs["env"], **extra}


def _make_run(stubs, milestone=13):
    d = stubs["project"] / f".workflow/runs/m{milestone}"
    d.mkdir(parents=True)
    (d / "state.json").write_text("{}")


# guard-state.sh


def test_state_edit_blocked():
    path = f"{REPO}/.workflow/runs/m13/state.json"
    payload = {"tool_name": "Write", "tool_input": {"file_path": path}}
    r = run_hook("guard-state.sh", payload)
    assert r.returncode == 2 and "wf" in r.stderr


def test_state_relative_path_and_dotdot_blocked():
    for path in (".workflow/runs/m13/state.json", f"{REPO}/web/../.workflow/runs/m13/state.json"):
        payload = {"tool_name": "Edit", "tool_input": {"file_path": path}}
        assert run_hook("guard-state.sh", payload).returncode == 2, path


def test_state_notebook_path_blocked():
    path = f"{REPO}/.workflow/runs/m1/n.ipynb"
    payload = {"tool_name": "NotebookEdit", "tool_input": {"notebook_path": path}}
    assert run_hook("guard-state.sh", payload).returncode == 2


def test_state_write_via_bash_blocked_but_wf_allowed():
    write = bash("echo x > .workflow/runs/m13/state.json")
    assert run_hook("guard-state.sh", write).returncode == 2
    cmd = "uv run --project workflow wf finish T1.implement --milestone 13 --status done"
    assert run_hook("guard-state.sh", bash(cmd)).returncode == 0


@pytest.mark.parametrize(
    "cmd",
    [
        "echo x >> .workflow/runs/m13/state.json",
        "cat a | tee .workflow/runs/m13/state.json",
        "rm -rf .workflow/runs/m13",
        "mv x .workflow/runs/m13/state.json",
        "cp x .workflow/runs/m13/state.json",
        "sed -i s/a/b/ .workflow/runs/m13/state.json",
        "truncate -s 0 .workflow/runs/m13/state.json",
        "touch .workflow/runs/m13/state.json",
    ],
)
def test_state_bash_writes_blocked(cmd):
    assert run_hook("guard-state.sh", bash(cmd)).returncode == 2


@pytest.mark.parametrize(
    "cmd",
    [
        "cat .workflow/runs/m13/state.json",
        "ls .workflow/runs",
        "grep status .workflow/runs/m13/state.json",
        "jq .nodes .workflow/runs/m13/state.json | head",
        "ls web",
        "cat .workflow/runs/m13/state.json 2>/dev/null",
        "cat .workflow/runs/m13/state.json 2>&1 | head",
    ],
)
def test_state_bash_reads_allowed(cmd):
    assert run_hook("guard-state.sh", bash(cmd)).returncode == 0


def test_unrelated_edit_allowed():
    payload = {"tool_name": "Edit", "tool_input": {"file_path": f"{REPO}/web/src/a.ts"}}
    assert run_hook("guard-state.sh", payload).returncode == 0


# guard-merge.sh


def test_merge_guard_uses_records_when_run_exists(stubs):
    _make_run(stubs)
    out = json.dumps({"ok": False, "reasons": ["no gate record for T1 at abc"]})
    r = run_hook("guard-merge.sh", bash(MERGE), _env(stubs, UV_OUT=out, UV_EXIT="1"))
    assert r.returncode == 2 and "gate" in r.stderr
    assert "check-merge 5 --milestone 13" in stubs["log"].read_text()


def test_merge_guard_passes_when_records_ok(stubs):
    _make_run(stubs)
    out = json.dumps({"ok": True, "reasons": []})
    assert run_hook("guard-merge.sh", bash(MERGE), _env(stubs, UV_OUT=out)).returncode == 0


def test_merge_guard_blocks_when_check_errors(stubs):
    _make_run(stubs)
    r = run_hook("guard-merge.sh", bash(MERGE), _env(stubs, UV_OUT="", UV_EXIT="2"))
    assert r.returncode == 2


def test_merge_guard_unchanged_without_run(stubs):
    assert run_hook("guard-merge.sh", bash(MERGE), _env(stubs)).returncode == 0
    assert not stubs["log"].exists()


def test_merge_guard_other_milestone_run_does_not_apply(stubs):
    _make_run(stubs, milestone=12)
    assert run_hook("guard-merge.sh", bash(MERGE), _env(stubs)).returncode == 0


def test_merge_guard_blocks_non_milestone_base(stubs):
    r = run_hook("guard-merge.sh", bash(MERGE), _env(stubs, GH_BASE="main"))
    assert r.returncode == 2 and "main" in r.stderr


def test_merge_guard_multiline_command_reads_the_pr_number(stubs):
    cmd = "cd /repo; echo hi\ngh pr merge 295 --squash --delete-branch"
    r = run_hook("guard-merge.sh", bash(cmd), _env(stubs, GH_BASE="main"))
    assert r.returncode == 2 and "PR 295 " in r.stderr
    assert run_hook("guard-merge.sh", bash(cmd), _env(stubs)).returncode == 0


def test_merge_guard_ignores_other_commands(stubs):
    assert run_hook("guard-merge.sh", bash("gh pr view 5")).returncode == 0
