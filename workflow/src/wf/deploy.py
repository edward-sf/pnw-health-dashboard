"""Wait for the build-deploy run of a merged commit."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from wf.config import Project
from wf.github import Gh

_FIELDS = "databaseId,status,conclusion,headSha,url"


@dataclass(frozen=True)
class DeployResult:
    conclusion: Literal["success", "failure", "timeout"]
    run_url: str | None


def _find_run(gh: Gh, project: Project, branch: str, sha: str) -> dict[str, object] | None:
    raw = gh.run([
        "run", "list", "--workflow", project.deploy_workflow, "--branch", branch,
        "--limit", "20", "--json", _FIELDS,
    ])  # fmt: skip
    try:
        runs = json.loads(raw)
    except ValueError:
        return None
    for run in runs if isinstance(runs, list) else []:
        if isinstance(run, dict) and run.get("headSha") == sha:
            return run
    return None


def watch_deploy(
    gh: Gh,
    project: Project,
    branch: str,
    sha: str,
    timeout_s: int = 1800,
    poll_s: int = 30,
    sleep: Callable[[float], None] = time.sleep,
) -> DeployResult:
    """Poll until the run for `sha` completes. Elapsed time is counted in polls, not read
    from a clock, so a stalled `gh` call cannot stretch the budget unnoticed by the tests."""
    waited = 0
    url: str | None = None
    while True:
        run = _find_run(gh, project, branch, sha)
        if run is not None:
            url = str(run["url"]) if run.get("url") else url
            if run.get("status") == "completed":
                ok = run.get("conclusion") == "success"
                return DeployResult("success" if ok else "failure", url)
        if waited >= timeout_s:
            return DeployResult("timeout", url)
        sleep(poll_s)
        waited += poll_s
