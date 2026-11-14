"""Merge an issue PR into its milestone branch, but only on records for the PR's current head."""

from __future__ import annotations

import fnmatch
import json
from dataclasses import dataclass
from typing import Any

from wf.github import CommandError, Gh
from wf.schedule import TaskGraph
from wf.state import RunState, latest_gate, latest_review

ROLLUP_CHECK = "ci"
MILESTONE_BASE = "milestone/*"


@dataclass(frozen=True)
class MergeCheck:
    ok: bool
    reasons: list[str]


def view_pr(gh: Gh, pr: int, fields: str) -> dict[str, Any]:
    try:
        view = json.loads(gh.run(["pr", "view", str(pr), "--json", fields]))
    except ValueError as e:
        raise CommandError(f"cannot read gh pr view output for PR {pr}") from e
    if not isinstance(view, dict):
        raise CommandError(f"cannot read gh pr view output for PR {pr}")
    return view


def task_for_branch(graph: TaskGraph, branch: str) -> str | None:
    for task_id, node in graph.tasks.items():
        if node.branch == branch:
            return task_id
    return None


def _ci_state(rollup: Any) -> str | None:
    """The state of the check named `ci`; check runs report `conclusion`, statuses `state`."""
    for check in rollup if isinstance(rollup, list) else []:
        if isinstance(check, dict) and ROLLUP_CHECK in (check.get("name"), check.get("context")):
            value = check.get("conclusion") or check.get("state")
            return str(value) if value else "PENDING"
    return None


def check_merge(state: RunState, task: str, pr: int, gh: Gh) -> MergeCheck:
    view = view_pr(gh, pr, "headRefOid,baseRefName,statusCheckRollup")
    head, base = str(view.get("headRefOid", "")), str(view.get("baseRefName", ""))
    reasons: list[str] = []
    if not fnmatch.fnmatchcase(base, MILESTONE_BASE):
        reasons.append(f"base is '{base}', not a {MILESTONE_BASE} branch")
    gate = latest_gate(state, task, head)
    if gate is None:
        reasons.append(f"no gate record for {task} at {head}")
    elif not gate.passed:
        reasons.append(f"latest gate for {task} at {head} failed")
    review = latest_review(state, task, head)
    if review is None:
        reasons.append(f"no review record for {task} at {head}")
    elif review.result != "pass":
        reasons.append(f"latest review for {task} at {head} has findings")
    ci = _ci_state(view.get("statusCheckRollup"))
    if ci is None:
        reasons.append(f"no '{ROLLUP_CHECK}' check on PR {pr}")
    elif ci != "SUCCESS":
        reasons.append(f"'{ROLLUP_CHECK}' check is {ci}")
    return MergeCheck(not reasons, reasons)


def merge_task(state: RunState, task: str, pr: int, gh: Gh) -> str:
    """Squash-merge and return the merged commit's SHA. Refuses unless `check_merge` is ok."""
    check = check_merge(state, task, pr, gh)
    if not check.ok:
        raise CommandError("not merging: " + "; ".join(check.reasons))
    gh.run(["pr", "merge", str(pr), "--squash", "--delete-branch"])
    commit = view_pr(gh, pr, "mergeCommit").get("mergeCommit")
    oid = commit.get("oid") if isinstance(commit, dict) else None
    if not isinstance(oid, str) or not oid:
        raise CommandError(f"PR {pr} merged, but gh reports no merge commit")
    return oid
