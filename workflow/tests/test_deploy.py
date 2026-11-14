from pathlib import Path

from wf.config import load_project
from wf.deploy import watch_deploy
from wf.github import FakeGh

PROJECT = load_project(Path(__file__).resolve().parents[2] / "workflow/project.toml")


def run(sha, status, conclusion=None):
    return {"headSha": sha, "status": status, "conclusion": conclusion, "url": f"https://r/{sha}"}


def test_watch_matches_sha_and_reports_failure():
    gh = FakeGh(run_lists=[[], [run("aaa", "in_progress")], [run("aaa", "completed", "failure")]])
    result = watch_deploy(gh, PROJECT, "milestone/m13", "aaa", sleep=lambda s: None)
    assert result.conclusion == "failure" and result.run_url == "https://r/aaa"


def test_watch_reports_success_and_ignores_other_shas():
    gh = FakeGh(
        run_lists=[[run("zzz", "completed", "failure"), run("aaa", "completed", "success")]]
    )
    assert (
        watch_deploy(gh, PROJECT, "milestone/m13", "aaa", sleep=lambda s: None).conclusion
        == "success"
    )


def test_watch_queries_the_deploy_workflow_on_the_branch():
    gh = FakeGh(run_lists=[[run("aaa", "completed", "success")]])
    watch_deploy(gh, PROJECT, "milestone/m13", "aaa", sleep=lambda s: None)
    call = gh.calls[0]
    assert call[:2] == ["run", "list"]
    assert call[call.index("--workflow") + 1] == PROJECT.deploy_workflow
    assert call[call.index("--branch") + 1] == "milestone/m13"


def test_cancelled_run_is_a_failure():
    gh = FakeGh(run_lists=[[run("aaa", "completed", "cancelled")]])
    assert (
        watch_deploy(gh, PROJECT, "milestone/m13", "aaa", sleep=lambda s: None).conclusion
        == "failure"
    )


def test_watch_times_out():
    sleeps: list[float] = []
    gh = FakeGh(run_lists=[[]] * 100)
    result = watch_deploy(gh, PROJECT, "milestone/m13", "aaa", timeout_s=60, poll_s=30,
                          sleep=sleeps.append)  # fmt: skip
    assert result.conclusion == "timeout" and result.run_url is None and sleeps == [30, 30]
