---
name: run-milestone
description: Walk a milestone's workflow graph (workflow/graph.toml) with the wf CLI, dispatching each agent node with its model and package, until the milestone PR is ready for the author's verdict. Use when the user runs /run-milestone <N> or asks to run, continue or restart a milestone run.
argument-hint: "<milestone number>"
---

# /run-milestone <N>

You are the orchestrator. `wf` (`uv run --project workflow wf <command> --milestone <N> …`) is the walker: it decides what runs next, keeps the run state and enforces budgets. You ask it, do what it says, and report results back through it. You judge nothing yourself: reviewers write verdicts, `wf` ingests them.

Every `wf` command prints JSON on stdout. Exit 0 is success; anything else is listed under "Exits" below.

## Hard rules

- **Never merge a PR whose base is `main`, and never approve any PR.** Milestone PRs and `checkpoint` issues are the author's. Merge issue PRs only through `wf merge`.
- **Never write under `.workflow/runs/`**: no Edit, Write or shell redirect there. Run every command that names that path from the repo root, starting with `uv run --project workflow wf ` (the state hook blocks anything else). Your own scratch files go in `.workflow/work/m<N>/`.
- **Never run `wf clear`.** Clearing an escalation is the author's decision.
- **Never write or edit a verdict.** If a reviewer did not write one, re-dispatch it or escalate.
- **On any unexpected `wf` exit, escalate rather than improvise**: `wf escalate <node> --reason "<command>: <stderr line>"`, notify, stop. Do not retry with other flags, edit state, or skip the node.
- One node at a time (deploy-watch in the background is the only overlap).

## Start or restart

1. `wf status`. If it says there is no run state, the milestone has not been set up: stop and tell the author to run `wf setup` (after the plan gate).
2. Read the task graph named by `task_graph` in the status: it gives each task's `issue`, `branch` and `steps`.
3. **Restart:** in a new session, every node with `status: running` is interrupted: no subagent or background job of this session is working on it. `wf resume <node>` each one (it returns the round it spent), then let `wf next` dispatch it again; a resumed deploy-watch just polls again. If `final-review` is done, recover `{report_path}` with `ls docs/reviews/*-m<N>-final-review.md`, because its date may not be today's. When a resumed node is dispatched, an implement or batched-fix node gets the steps already on its branch: `git log --oneline origin/milestone/m<N>..origin/<branch>` (one line per step, oldest first).

## The loop

Repeat until a step says stop:

1. Call `mcp__ccd_session_mgmt__get_usage`. Keep its `5-hour limit` `percentUsed` as `pct_before`.
2. Pass the JSON to `wf next` on stdin, exactly as returned:
   ```
   uv run --project workflow wf next --milestone <N> --usage - <<'EOF'
   <get_usage JSON>
   EOF
   ```
3. Act on `decision`:
   - `dispatch` → run `node` as below. The decision's `model` (`opus` / `sonnet`) is the Agent tool's `model` parameter; never choose one yourself.
   - `waiting` → a background job (deploy-watch) is still running. Wait for its notification; do not poll.
   - `pause` → `PushNotification`: "M<N> paused until <until>: <reason>". Under `/loop`, `ScheduleWakeup` for `min(3600, until − now)` seconds; otherwise stop the turn.
   - `blocked` → `PushNotification`: "M<N> blocked:" and each escalation's node and reason. Stop.
   - `done` → stop and report (see the end).

## Agent nodes

For every agent node:

1. `wf start <node>`. Exit 2 here means the budget is spent (`wf` has recorded the escalation): notify as for `blocked`, stop.
2. For a review node, build its package (below). Its JSON gives `path` and `verdict_path`.
3. Fill the prompt `workflow/prompts/<kind>.md`: replace each `{placeholder}` with the value named below, and dispatch one subagent with the Agent tool, `model` from the decision, the filled prompt as its prompt.
4. On return: `get_usage` again (`pct_after`), then `wf usage <node> --pct-before <b> --pct-after <a> --tokens <total tokens from the task notification>`. Skip `wf usage` if either read had no `5-hour limit` window.
5. Record the result (per kind below). A subagent that reports BLOCKED: `wf finish <node> --status escalated --note "<its reason>"`, notify, stop.

Placeholders: `{N}`; `{task_id}`, `{issue}`, `{branch}`, `{k}` (task number) from the task graph; `{plan_path}`, `{spec_path}` from the task graph's `plan` / `spec`; `{package_path}`, `{verdict_path}` (and, for the final review, `{report_path}`) from `wf package`; `{triage_path}`, `{must_fix_path}`, `{final_verdict_path}` as set in the table (later nodes reuse them); `{date}` today (YYYY-MM-DD); `{steps_committed}` and `{findings}` as below, `(none)` when empty.

| Node | Before dispatch | After |
|---|---|---|
| `T<k>.implement` | `{findings}`: the failed checks and log paths of the last gate, or the last task-review verdict's findings | `wf finish T<k>.implement --status done` |
| `T<k>.task-review` | `wf package task-review --milestone <N> --task T<k>` | `wf ingest T<k>.task-review <verdict_path>`; `pass` → `wf finish … --status done`; `findings` → send back (below) |
| `final-review` | On `milestone/m<N>` at `origin` head: `wf package final --milestone <N> --range $(git merge-base origin/main HEAD)..HEAD` | `wf ingest final-review <verdict_path>` (before any commit), then commit the report on `milestone/m<N>` (`docs: M<N> final review`), push, `wf post-final-review <milestone PR> --report <report_path>`, `wf finish final-review --status done` |
| `triage` | `{final_verdict_path}` = the ingested final verdict; `{triage_path}` / `{must_fix_path}` = `.workflow/work/m<N>/triage.json` / `must-fix.json` | `wf finish triage --status done`. Nothing must-fix → `wf finish batched-fix --status done --note "nothing must-fix"` and the same for `delta-review` |
| `batched-fix` | Start it with `wf start batched-fix --milestone <N> --branch m<N>-final-review-fixes` (this records the fix branch). `{branch}` = that branch; `{delta_verdict_path}` = the last delta verdict, `{findings}` = the last fix gate's failed checks, each or `(none)` | `wf finish batched-fix --status done`; keep the PR number and fix range it reports. Then, on the fix branch at its pushed head, `wf gate batched-fix --milestone <N>`. Exit 1 → `wf finish batched-fix --status failed --note "gates failed at <sha7>"` (the next round fixes them) |
| `delta-review` | On the fix branch at its pushed head: `wf package delta --milestone <N> --range <fix range> --findings <must_fix_path>` | `wf ingest delta-review <verdict_path>`; `pass` → `wf finish delta-review --status done`, then merge the fix PR: `gh pr checks <fix PR> --watch`, `wf merge <fix PR> --milestone <N>` (it needs the `batched-fix` gate and this passing delta review for the PR's head); `findings` → `wf finish delta-review --status failed` and `wf finish batched-fix --status failed --note "delta findings r<k>"` |
| `retro` | `uv run --project workflow wf status --milestone <N> > .workflow/work/m<N>/status.json`; `{status_path}` that file; `{baseline}` from the plan or `(not recorded)` | `wf finish retro --status done` |

**Send back** after task-review findings: `wf finish T<k>.task-review --status failed --note "findings r<round>"`, `wf finish T<k>.gates --status failed`, `wf finish T<k>.implement --status failed --note "review findings"`. The next `wf next` dispatches implement again; its `wf start` enforces the 3-round budget, and the review's own `wf start` the 2-round budget.

`wf ingest` exit 2 (stale SHA, invalid verdict, wrong node) is unexpected: escalate.

## Script nodes

Check out the task branch at its pushed head (`git switch <branch> && git pull --ff-only`) before `gates`.

- `T<k>.gates`: `wf start T<k>.gates`; `wf gate T<k> --milestone <N>`. Exit 0 → `wf finish T<k>.gates --status done`. Exit 1 → `wf finish T<k>.gates --status failed --note "<failed checks>"` and `wf finish T<k>.implement --status failed --note "gates failed at <sha7>"`; logs are in the run's `logs/` folder.
- `T<k>.merge`: find the PR (`gh pr list --head <branch> --json number`), wait for its checks (`gh pr checks <pr> --watch`), then `wf start T<k>.merge` and `wf merge <pr> --milestone <N>` (it finishes the node). Never `gh pr merge` directly.
- `T<k>.deploy-watch`: `wf start T<k>.deploy-watch`, then `uv run --project workflow wf deploy-watch T<k>.deploy-watch --milestone <N>` **in the background** (`run_in_background`); it finishes the node. Exit 1 (red) or 3 (timeout): `wf escalate T<k>.deploy-watch --reason "build-deploy <conclusion>: <run_url>"`, notify, stop.
- `final-gates`: on `milestone/m<N>`, pulled after the fix PR merged, `wf start final-gates`; `wf gate final-gates --milestone <N> --base origin/main`. Exit 0 → done; exit 1 → `wf escalate final-gates --reason "<failed checks>"`, notify, stop.
- `milestone-pr`: first post the outcomes. Write `.workflow/work/m<N>/outcomes.json` from the triage, one entry per finding id: must-fix → `"fixed in #<fix PR>"`, defer → `"deferred: <reason>"`, ask-author → `"ask-author: <reason>"`. Run `wf post-outcomes <milestone PR> --findings <final verdict> --outcomes <that file>`. Then `wf start milestone-pr`, `wf milestone-pr --milestone <N> --ready`, `wf finish milestone-pr --status done`.

The milestone PR is `gh pr list --head milestone/m<N> --base main --json number`. Issue PRs and the fix PR merge only through `wf merge`; the milestone PR never.

## Exits

- `0` success. `1` a check failed (`gate`, `deploy-watch` red, `check-merge` not ok): handled per node above. `2` refused or unreadable (budget spent, stale verdict, bad input, run state unreadable). `3` deploy-watch timeout.
- Anything not handled above: escalate.

## The end

When `wf next` says `done` (the tail ran in order: final-review → triage → batched-fix ⇄ delta-review, at most 2 rounds → final-gates → outcomes → milestone PR ready → retro), `PushNotification`: "M<N> ready for your verdict" with the milestone PR link. Report in five lines: the PR, findings by decision, escalations, fix rounds used, the retro path. Then stop. The author reviews, posts a verdict and merges.

## Known gaps

- **Task-review budget is checked late.** It is enforced when the next review starts, so after the last allowed review round finds problems, one more implement and gates round runs before `wf start` refuses the review and escalates.
- **A red deploy escalates.** Spec §5.2 allows one fix round per red `build-deploy`; here a red or timed-out deploy-watch escalates to the author instead.
