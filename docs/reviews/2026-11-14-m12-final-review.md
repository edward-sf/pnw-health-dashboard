# M12 workflow engineering — final whole-branch review

**Reviewed:** `13b1554..53f78e6` (12 commits, #290–#303) · **Date:** 2026-11-14 · **Milestone PR:** #291 · **Fixes:** #304

M12 final whole-branch review — the automated pre-merge review, run with this milestone's own final-review prompt at 53f78e6. This is the reviewer's report as written, followed by what happened to each finding. It is not the author's milestone review (`docs/milestone-review-template.md`).

## Outcome

| Finding | Status | Where |
|---|---|---|
| I1. Escalations can be left without the author | Fixed. `wf finish` refuses a node that is not running and never moves an escalated one; `guard-state.sh` blocks any Bash command containing `wf clear`, which the author runs in their own terminal. Documented in the README, the skill and spec §11, whose example now passes `--milestone`. | b63b24b |
| I2. A run reaches `done` with no records | Fixed. `finish --status done` needs the node's record for the head it resolves (gate, review, or a verdict ingested this round); `merge`, `deploy-watch` and `milestone-pr` are done only through their own commands. The reviewer's walk now stops at `T1.gates`. | 7e8b3eb |
| I3. Verdict authorship is not enforced | Fixed with option (b): `wf ingest` needs a running node and a verdict written after the round started. Authorship itself is recorded as a known gap in spec §11. | 1f9a3e2 |
| I4. Pilot cost not measured like the baseline | Fixed. The retro runs `wf baseline` with M11's flags, reports tokens and cache reads per task next to M11's, and the whole run's 5-hour-window percent (`wf usage-total`, from readings `wf next` logs). The M11 baseline is `workflow/baselines/m11.json`. The skill calls `get_usage` only after agent nodes. | 814f57a |
| M1. Gate record keyed to HEAD but run on the working tree | Fixed: `wf gate` refuses a dirty tree. | f4a2124 |
| M2. State hook prefix lets chained writes through | Fixed: the prefix is trusted only for a command with no shell operator. The skill's retro `wf status >` line names `.workflow/work/`, so it is not affected. | 0401cda |
| M3. Past `resetsAt` with a stale high percent pauses | Fixed: a past reset counts as 0%. | 9b9e111 |
| M4. Script nodes have no budget | Fixed: `gates` has `budget = 3`. | d1a3147 |
| M5. `wf resume` refunds without limit | Deferred, a known gap: restarts are the author's. | — |
| M6. Verdict paths relative to the ingest cwd | Fixed: stored relative to root, resolved against it. | f66667f |
| M7. False "hook error" before merge-guard blocks | Fixed. | b10a9fb |
| M8. Throttling applies only to specs importing `./fixtures` | Fixed with a line in CONTRIBUTING and the workflow README (not enforced). | c1d5a83 |
| M9. Fix-PR merge's `build-deploy` not watched | Fixed: `wf deploy-watch` without a node watches the milestone head; the skill runs it after the report push, the fix-PR merge and the retro push. | dc65c3a |
| M10. `ask-author` findings do not stop the run | Decided: the author decides them at the merge gate, from the outcome comment. README corrected, spec §11 line added. | c1d5a83 |
| M11. False overlap when a dependent task comes first | Fixed. | 75dc28f |
| M12. Missing outcome posted as "ask author" | Fixed: posted as "no outcome recorded". | ca2ee6d |
| Triage: `finish("escalated")` after `escalate` duplicates the record | Resolved by I1: `finish` refuses an escalated node. | b63b24b |
| Triage: spec §11 `wf clear` example omits `--milestone` | Fixed with I1. | b63b24b |
| Triage: replay doc says "about 1.9x" | Fixed: the measured 2.10x overall. | 814f57a |
| Recommendation 5: skip `get_usage` before script nodes | Done with I4. | 814f57a |
| Other "can stay deferred" triage items | Deferred. | — |

## Report

Range `13b1554..53f78e6` on `milestone/m12`, read from the detached worktree at `53f78e6` and the combined diff. I read every engine module under `workflow/src/wf/`, both hooks and `.claude/settings.json`, the run-milestone skill, all seven prompts, `graph.toml`, `project.toml`, `ci.yml`, the e2e fixture, the README and the CONTRIBUTING, template and spec §11 changes. Against the spec and plan, I checked the ledger extract and the replay/baseline doc. "The running app" here is the `wf` CLI, so I ran it end to end on a scratch repo: a toy two-task plan with a bare `origin`, and a fake `gh` on `PATH` that keeps PR, CI and deploy state and squash-merges into the bare repo. With it I ran `check-plan → setup → next → start/finish → gate → package → ingest → check-merge → merge → deploy-watch`, then the milestone tail (`final-review → triage → batched-fix → gate → delta-review → fix-PR merge → final-gates`), plus scripted probes for each Review Focus item and each anti-goal. I fed both hooks the real command shapes the skill and an orchestrator would emit, as JSON on stdin. On an archive copy of the head, I ran `ruff`, `ruff format --check`, `mypy` and `pytest`. I also made read-only `gh` calls for branch protection, `build-deploy` and `ci` runs. Probe scripts are in the session scratchpad, outside the repo. What I did not do: dispatch agents through the skill, since subagents were not allowed (so the skill's wording was walked by hand, not by a live orchestrator); run Playwright locally; or make any GitHub write. Not read line by line: the bodies of the plan's task sections (headings and task block read), `uv.lock`, and test bodies other than the ones cited. Working tree, index and HEAD untouched.

### Strengths

- **Corrupt state is refused, never replaced (Review Focus 1).** `state.py:189-196` turns every parse or shape error into `run state unreadable: <path>`, and `init_run` (`state.py:99-101`) refuses an existing file. I measured a half-written state (first 300 bytes) and a 0-byte state: `wf status`, `wf start` and `wf next` each exit 2 with that message, and `wf init` exits 2 with "run state already exists". Saves are temp-plus-`os.replace` (`state.py:199-204`), and no `.tmp` was left behind.
- **The merge rail holds for the new-commit case (Review Focus 3).** `merge.py:56-77` checks base, latest gate and latest review for the PR's current head, plus `ci`. `merge.py:87-90` pins the merge with `--match-head-commit`. Measured after a push on top of a passing gate and review: `wf check-merge 105` exits 1 with "no gate record … no review record for T1 at 7acfb29…". `wf merge` exits 2 and does not merge. `guard-merge.sh` blocks `gh pr merge 105 --squash` (exit 2) in every form I tried: flags before the number, `cd … &&` prefixes, after `git push &&`, multi-line commands, and `--subject "a b"`. With fresh records the same command passes the hook (exit 0); with `ci` = FAILURE it is blocked ("'ci' check is FAILURE"). `gh pr merge 104` into `main` is blocked ("targets 'main'").
- **Setup refuses before touching anything (Review Focus 5).** `setup.py:253-255` checks the plan before any git or gh call. Measured on a plan with an unknown dependency and an undeclared overlap: exit 2 with both problems listed, **0 gh calls**, no branch. `check-plan` lists each problem for no block, an unknown id, a cycle and an overlap. The happy path ran end to end against the fake: milestone, two issues, the task graph, the plan PR squash-merged into `milestone/m99`, a draft milestone PR, and the run state.
- **Unavailable usage dispatches with pacing off (Review Focus 2).** `schedule.py:295-298`. Measured: `status: unavailable` and `status: not_applicable` each give `dispatch T1.implement, pacing: off`, with no pause and no crash.
- **Budgets bite where `wf start` is used.** `state.py:221-231`. Measured: a third task-review start is refused, with "budget of 2 rounds exhausted" and an escalation recorded. A fourth implement start is refused, with exactly one escalation. A second batched-fix round is the last one.
- **The fix-PR path works across task seams.** Measured: `wf start batched-fix --branch` → `wf gate batched-fix` → `wf package delta` → `wf ingest delta-review` → `wf check-merge` ok → `wf merge` (task `batched-fix`) → `next` = `final-gates`. This is the T7↔T9 seam (`merge.py:66`, `cli.py:258-264`).
- **The final review stays unfenced (goal 4, anti-goal 1).** `packages.py:108-117` writes the free-access rule into the final package and the fence into the task and delta packages. The replay (`docs/reviews/2026-11-14-m12-replay-and-baseline.md`) found all three scored M11 findings blind. Its method is sound: the prompt was stripped of M11 names, the worktree was at `544bbf2`, and history was barred.
- **The engine is clean and tested.** On the head: ruff clean, 37 files formatted, mypy clean on 15 files, **208 passed in 2.6s**. Every `wf` call took about 0.35s.
- **The CI change does its job.** On the milestone PR's `ci` at `53f78e6`, the throttled step repeated six changed specs ×3 at 4× CPU throttle in 7m09s, and `e2e` passed. All 13 `build-deploy` runs on `milestone/m12` are green, including `53f78e6`, which was `in_progress` in the package and is now `success`.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**I1. Escalations can be left without the author (§5.3 escalation gate, §5.6 "the script refuses to advance a node", anti-goals 2 and 5)**
- Files: `workflow/src/wf/state.py:234-242` (`finish`), `state.py:256-265` (`clear`), `workflow/src/wf/cli.py:487-492`, `.claude/hooks/guard-state.sh:47`, `.claude/skills/run-milestone/SKILL.md:17`.
- What happens: `finish` sets any status from any status. An escalated node can be finished `done`, and `wf clear` (which records the note as `author: …`) can be run by the orchestrator. No hook looks at either: `guard-state.sh:47` passes every command that starts with `uv run --project workflow wf `. "Never run `wf clear`" is an instruction only.
- Measurement: I took a red `build-deploy` (`wf deploy-watch` exit 1), ran `wf escalate T1.deploy-watch`, and `next` said `blocked`. Then I ran `wf finish T1.deploy-watch --status done --note "looks fine"`: exit 0, and `next` gave `dispatch T2.implement`. From the snapshot, `wf clear T1.deploy-watch --note "orchestrator says ok"` gave status `pending`, with the note stored as `author: orchestrator says ok`, and `next` re-dispatched it. Both hooks returned 0 on both commands.
- Why it matters: the escalation is the author's gate. The spec chose a script walker so that a drifting session could not improvise past it. Here a single command does, and the clear path also forges the record of who decided.
- Fix: `finish` refuses unless the node is `running`. It never moves an `escalated` node, which leaves only through `clear`. Have `guard-state.sh` block any Bash command that contains `wf clear`, because the author runs it in their own terminal, where no hook applies. Add tests for both.

**I2. A run reaches `done` with no records, final review included (anti-goal 2 "silent advance", anti-goal 1)**
- Files: `state.py:234-242`, `cli.py:487-488`. The skill rows that rely on it are `SKILL.md:60-66, 76-80`.
- What happens: `wf finish <node> --status done` needs no prior `start`, no gate record, no ingested verdict and no deploy result. Only the issue-PR and fix-PR merges are protected, through `wf merge`, the hook and the records. The gates, task-review, deploy-watch, final-review, delta-review, final-gates and milestone-pr nodes all advance on the orchestrator's word.
- Measurement: on a fresh run with two tasks, I called `wf finish … done` 17 times, each on a node `next` had just dispatched and none of them ever started. The result was `{"decision":"done"}` with `gates: 0, reviews: 0, escalations: 0`. `final-review` was finished `done` without a package or a verdict.
- Why it matters: the skill would then send "M<N> ready for your verdict". This is the "soft parts can still drift" risk on the one node anti-goal 1 protects, at the same cost as the merge rail, which the build already shows how to enforce.
- Fix: in `cli.py`/`state.py`, make `finish --status done` require the matching record:
  - `*.gates` and `final-gates`: a passing gate record at the current HEAD.
  - `*.task-review` and `delta-review`: a `pass` review record at the head.
  - `final-review`: an ingested verdict at the head.
  - `*.merge` and `*.deploy-watch`: done only through `wf merge` and `wf deploy-watch`. A `--note` can stand in as the author's override only through `wf clear`.

  Also refuse `finish` on a node that is not `running`.

**I3. Verdict authorship is not enforced (§5.6 "Verdicts come from the reviewers themselves", listed under hooks)**
- Files: `workflow/src/wf/packages.py:61-64` (`verdict_path` under `.workflow/work/`), `guard-state.sh:15, 36-43`, `workflow/src/wf/verdict.py:108-120`.
- What happens: T9's ruling C1 moved verdicts out of the protected runs directory, so a subagent could write them. Nothing took the hook's place. A Write to `/…/.workflow/work/m99/verdicts/final-review-r1.json` passes `guard-state.sh` (exit 0). `ingest` checks the node and the SHA, not who wrote the file.
- Measurement: as above, the hook returned 0 for the Write. In the scratch walk, verdicts written by hand were ingested and then merged (`wf merge 105` → `6ff9194`).
- Why it matters: with I2, the merge rail ("passing review record") rests on the instruction "Never write or edit a verdict". The ruling's "cost if wrong: none" understates this.
- Fix (cheapest first):
  - (a) Block Edit, Write and Bash writes under `.workflow/work/*/verdicts/` for tool calls made by the main session. The PreToolUse payload identifies subagent calls, if this Claude Code version provides it (to verify).
  - (b) Failing that, have `wf start <review node>` record a start time. Have `wf ingest` require the verdict's mtime to fall after it and the file to be absent at `start`. This does not prove authorship, but it closes the reuse and hand-edit shortcut.
  - (c) If neither is possible, say so in spec §11 as a known gap, as was done for the state hook.

**I4. The pilot's token target is not measured the way the baseline was, and orchestration overhead is invisible (§5.10 target 3, goal 7, anti-goal 4)**
- Files: `workflow/prompts/retro.md:16, 19-22`; `docs/reviews/2026-11-14-m12-replay-and-baseline.md:47`; `workflow/src/wf/baseline.py:12, 57-59`; `SKILL.md:53, 66`.
- What happens: the retro computes "tokens per task (sum of a task's implement, task-review and fix tokens)" from the `tokens` the skill records with `wf usage`, which come from the task notification. It judges target 3 against 0.86M from that figure. The baseline doc says M13 "must be measured with the same `wf baseline` method, or the comparison is invalid". It also says the notification counter "may not be computed the same way". Nothing tells the retro to run `wf baseline`. The orchestrator's own main-session tokens are recorded nowhere in run state, yet M11's figure includes M11's main session. Both measures leave out cache reads: M11 had 171.9M against 6.89M counted, about 21.5M per task. A long orchestrator session doing about 30 small tool calls per task is the cost pattern that cache reads carry.
- Measurement: a read of the prompt and the skill. I counted the skill's calls per task: about 30 tool calls, including 7 `get_usage` calls (3 of them before zero-cost script nodes), on top of the 2 agent dispatches.
- Why it matters: the pilot decides whether the graph graduates. As written, the retro compares subagent-only notification counts with a deduplicated transcript total that includes the main session. The comparison is biased toward "met", and anti-goal 4 (overhead against savings) cannot be judged from the retro's inputs.
- Fix:
  - The retro prompt requires `wf baseline --milestone 13 …`, with the same flags and method, for target 3.
  - It reports cache reads per task next to M11's 21.5M.
  - It reports the total 5-hour-window percent consumed across the run, with orchestration time included, not just per-node deltas.
  - `{baseline}` is filled with the M11 numbers from `m11-baseline.json`, not "(not recorded)".

#### Minor (Nice to Have)

**M1. A gate record is keyed to HEAD but runs on the working tree (plan constraint "Records are keyed by commit")**
- Files: `workflow/src/wf/gates.py:67-69, 92`.
- Measurement: at a commit that fails its gate (`passed: false`), deleting the offending file in the working tree only gave `passed: true` for the same SHA `66fa6a2`.
- Fix: refuse to gate when `git status --porcelain --untracked-files=no` is non-empty. CI still backstops the merge.

**M2. The state hook's prefix allowance lets chained writes through**
- Files: `guard-state.sh:47`.
- Measurement: `uv run --project workflow wf status --milestone 99 > .workflow/runs/m99/state.json` passed (exit 0) and truncated the state to 0 bytes. Every later command then refused with "run state unreadable", so the run is lost. `…; rm -rf .workflow/runs/m99` also passed. The skill's own retro step (`SKILL.md:66`) is this exact shape, one directory name away (`work` → `runs`).
- Fix: allow the prefix only when the rest of the command has no shell operator (`; & | > <`, `$(`, a backtick). Otherwise run the write check on the whole command.

**M3. A past `resetsAt` with a stale high percent pauses until the past (Review Focus 4, tested narrowly)**
- Files: `workflow/src/wf/schedule.py:300-317`. The test is `test_reset_in_the_past_counts_as_fresh`, which uses 50%.
- Measurement: 99% with `resetsAt` 2026-11-14T01:00Z, and now 22:25Z, gave `pause until 2026-11-14T01:00:00.000Z`. Under `/loop`, the skill's wakeup of `min(3600, until − now)` is then ≤ 0, so it calls `get_usage` again at once.
- Fix: when `_is_past`, treat `pct_used` as 0 (the window has reset), and test that at 99%.

**M4. Script nodes have no budget, so the gates loop is bounded only by the skill's send-back (anti-goal 3)**
- Files: `workflow/graph.toml:16-19`, `SKILL.md:76`.
- Measurement: with `implement` done and `gates` failed each time, `next` dispatched `T1.gates` 8 times in a row, `rounds: 8`, and `wf start` never refused.
- Fix: give `gates` a budget, or have `wf gate` exit 1 mark the task's `implement` failed itself.

**M5. `wf resume` refunds without limit**
- Files: `state.py:245-253`.
- Measurement: 6 cycles of `start` and `resume` left `rounds: 0`. Restarts are author-initiated, so this is bounded in practice.
- Fix: count resumes per node, and escalate on the second.

**M6. Verdict paths are stored relative to the ingest cwd, so the final package can lose every deferred minor (anti-goal 1, adjacent)**
- Files: `verdict.py:118`, `packages.py:94, 161`.
- Measurement: `wf package final` run from the repo root listed two outcomes and two deferred minors. The same command with `--root` from another cwd gave "(verdict unreadable: cannot read verdict .workflow/work/m99/verdicts/T1.task-review-r1.json …)" for both, and no deferred minors.
- Fix: store the path relative to root and resolve it against root.

**M7. `guard-merge.sh` prints a false "hook error" before most blocks**
- Files: `guard-merge.sh:6, 9, 59, 72`.
- What happens: `set -E` carries the ERR trap into `$(…)`. A refused `wf check-merge` or a failed `gh pr view` prints "hook error (unexpected failure while checking the merge)" and then the real reason.
- Measurement: seen on 9 of the 11 command shapes probed. The tests check substrings only (`test_hooks.py:79-258`).
- Fix: `trap - ERR` inside the substitutions, or `|| true` capture, plus a test that the hook-error text is absent on a refusal.

**M8. Throttling applies only to specs that import `./fixtures` (§5.5)**
- Files: `web/e2e/fixtures.ts:9-20`.
- What happens: a new spec importing `@playwright/test`, the default, is repeated but never throttled, and nothing says so.
- Fix: add ESLint `no-restricted-imports` for `@playwright/test` `test` under `web/e2e/` (fixtures excepted), or a line in CONTRIBUTING.

**M9. The fix-PR merge's `build-deploy` is not watched (§5.10 target 2)**
- Files: `SKILL.md:65, 79`.
- What happens: after `wf merge <fix PR>` the skill goes straight to `final-gates`. The report and retro pushes to the milestone branch are not watched either. Target 2 counts every red `build-deploy` after a merge.
- Fix: run `wf deploy-watch` on the milestone head before `final-gates`, inside the batched-fix budget.

**M10. `ask-author` findings do not stop the run, though the README says they escalate**
- Files: `SKILL.md:63, 80`; `workflow/README.md:61`; spec §5.3 ("a finding needs the author").
- What happens: the run fixes the must-fix findings, marks the milestone PR ready and runs the retro. The `ask-author` items surface only in the outcome comment. Spec §5.2 itself expects `ask-author` in that comment, so this is a doc and spec ambiguity more than a bug.
- Fix: decide, then either escalate after triage when any `ask-author` exists (cheaper: one fix PR, not two, which serves pilot target 1) or correct the README.

**M11. False overlap error when a dependent task precedes its dependency in plan order**
- Files: `workflow/src/wf/tasks.py:131-140`.
- Measurement: with T1 `depends_on = ["T2"]` and both changing `a.txt`, check-plan reported "T2 and T1 both change a.txt but T2 does not depend on T1".
- Fix: skip the pair when either reaches the other.

**M12. An outcome missing from `outcomes.json` is posted as "ask author"**
- Files: `workflow/src/wf/milestone_pr.py:13, 91`.
- Measurement: `M1` was left out of the outcomes file and was posted as `| M1 | minor | y | ask author |`.
- Fix: post "no outcome recorded", or refuse when an id is missing.

### Deferred minors — triage

| Source | Minor | Triage |
|---|---|---|
| T1 | `start_round` should refuse non-pending nodes | Resolved: `state.py:223-224` (T2, #293). |
| T1 | `finish(…, "escalated")` should record an escalation | Resolved: `state.py:241-242`. The duplicate when `escalate` was already called is still there (see T2). |
| T1 | No locking; "walker is serial" | Can stay deferred, but the reason is not quite true: the background `deploy-watch` saves while foreground commands run (`cli.py:296-300`), with a window of milliseconds. An `fcntl` lock in `save` is cheap. |
| T1 | Areas table type check; `type: ignore`s (2, `config.py:105,134`); test gaps | Can stay deferred. |
| T2 | `last-decision.json` written non-atomically (`cli.py:198`) | Can stay deferred. A torn read returns `None` (`cli.py:373-376`), so the only loss is a window update. |
| T2 | `_is_past`/`same_window` aware/naive `TypeError` | Can stay deferred. Both inputs carry `Z` today, though an untagged `resetsAt` would give a traceback (only `ValueError` is caught). |
| T2 | Step counting duplicated (`cli._steps` and `node_estimate`) | Can stay deferred. |
| T2 | `finish("escalated")` after `escalate` duplicates the record | Can stay deferred. Folding it into I1's fix is natural. |
| T2 | Test hygiene; missing weekly-fit and failed-ready tests | Can stay deferred. |
| T2 ⚠️ | `resetsAt` stability | Resolved: `same_window` with 5-minute tolerance (`schedule.py:243-250`, T5 follow-up in #297). |
| T2 ⚠️ | Finish implement as failed after a gate failure | Resolved in the skill (`SKILL.md:76`), but by instruction only. See M4. |
| T3 | `plan_pr` 0 when none (`setup.py:344`) | Can stay deferred. |
| T3 | Squash merge may fail on required checks | Can stay deferred. `milestone/m12` is unprotected (`protected: false`, no required checks), and only `main` requires `ci`. |
| T3 | `_rel` duplication, `fmt: skip` blocks, no RED evidence | Can stay deferred. |
| T3 | Closed-milestone-PR guard runs after the plan PR merge (`setup.py:353-361`) | Can stay deferred. A re-run after reopening succeeds. |
| T3 | A merged-only milestone PR falls through to create | Can stay deferred. It only happens on a re-run of a finished milestone. |
| T4 | `--diff-filter=d` for deleted specs | Partly resolved: the gate has it (`gates.py:67`), CI does not (`ci.yml:96`). Can stay deferred. Only a PR whose only spec change is a deletion fails, and it fails loudly. A one-flag fix. |
| T4 | `base_ref` via env | Can stay deferred. Branch names are the owner's. |
| T4 | e2e on push duplicates `build-deploy` | Can stay deferred. It is CI minutes, not tokens. Recorded in §11. |
| T4 | Fixture throttles only the default page | Can stay deferred. Pair it with M8. |
| T4 carry | Multi-line commands mis-parsed by `guard-merge.sh` | Resolved (#300, `guard-merge.sh:34`). Measured: `echo hi⏎gh pr merge 105` resolved PR 105. |
| T5 | `shlex.quote` spec paths (`gates.py:82`) | Can stay deferred. |
| T5 | No CLI exit-1 test | Can stay deferred. |
| T5 | Empty diff passes vacuously (`gates.py:92`) | Can stay deferred, since CI is required at merge. A record with `checks: {}` should say "no checks ran" in the task package. |
| T5 | Default base not fetched | Can stay deferred. A stale base widens the diff, so more checks run, not fewer. |
| T5 carry | `check_merge` uses the latest gate | Resolved: `state.py:268-272`, `merge.py:61`. |
| T6 | `_runs` hides bad JSON as none (`packages.py:177-180`) | Can stay deferred. It shows as an empty history. |
| T6 | `delta_package` has no `--pr` | Can stay deferred. The skill checks out the pushed fix head. |
| T7 | Garbled deploy output polls to timeout; `CommandError` leaves the node unmarked | Can stay deferred. Exit 3 or 2 escalates. |
| T7 | `mergeCommit` read failure leaves the node unmarked | Can stay deferred. It escalates, and the author finishes the node by hand. |
| T7 | Unguarded `json.loads` (now `cli.py:333`) | Can stay deferred. Bad `gh` output gives a traceback, not a crash of state. |
| T7 | Missing CLI tests (deploy-watch exit 3, milestone-pr, post-outcomes) | Can stay deferred. |
| T7 | `_ci_state` takes the first `ci` | Can stay deferred. Issue PRs only get `pull_request` runs. The milestone PR's rollup has two `ci` entries, but it is never merged by `wf`. |
| T7 | `pr edit --body` vs `--body-file` | Can stay deferred. |
| T8 | Quoted separators truncate args | Can stay deferred. It fails closed (measured with `--subject "a b"`). |
| T8 | `--repo` not passed to check-merge | Can stay deferred. |
| T8 | Worktree runs skip the record check | Can stay deferred while the ledger's no-worktree ruling stands. Note that the hook looks for state only under `$CLAUDE_PROJECT_DIR`. |
| T8 | Merge guard fires on mentions | Can stay deferred. Documented (`README.md:115`). Measured: `echo 'the gh pr merge phrase'` blocked. |
| T8 | Heredoc false positives in guard-state | Can stay deferred. The other side of this is M2. |
| T8 | Pre-test misses a JSON-encoded tab | Can stay deferred. Contrived. |
| T9 | `wf usage` skipped when a window is missing | Can stay deferred. Sampling gaps only. |
| T9 | Report-path glob may match two files | Can stay deferred. |
| T10 | Spec §11 `wf clear` example omits `--milestone` (spec line 268) | Still present. A one-line doc fix, worth folding into I1's change. |
| T11 | `--limit 100` silent truncation; malformed first line not counted | Can stay deferred. |
| T11 | Doc says "about 1.9x" (overall 2.10x), replay doc line 47 | Still present. A one-word fix, worth doing with I4. |
| T11 | `cache_read` dedupe not asserted | Can stay deferred. Fold it into I4's test if cache reads become a pilot measure. |

### Rulings

| Ruling | Verdict |
|---|---|
| No separate worktree; issue branches in the main checkout | Agreed. The repo convention. |
| T3 exposes `check_plan_file` | Agreed. |
| T7 may extend FakeGh | Agreed. |
| `check-merge PR` finds the task by head branch | Agreed. Extended correctly to the fix branch (`cli.py:262-263`). |
| T2: `start_round` accepts `failed` | Agreed. The budget still caps it (measured). |
| T2 I1: blocked only when estimate × margin > 100 | Agreed. The rest pauses, which is visible. |
| T2 I2: `Waiting` decision; a missing node is an error | Agreed. |
| T3: plan PR `--delete-branch`; re-run on an open docs PR, `-k` suffix otherwise; a closed milestone PR is an error | Agreed. |
| Same window when `resetsAt` differs < 5 min | Agreed. Measured jitter is 269ms. |
| T6: `deploy_workflow = build-deploy.yml`; filter history to the branch | Agreed. |
| T7: `--match-head-commit` | Agreed. It closes the check-to-merge race (`merge.py:89`). |
| T8 I1–I3: one `pr view`, grep pre-test then jq, scripts trap to exit 2 | Agreed with the approach. The trap's side effect is M7. |
| T9: dry run split into a scripted CLI walk plus replay plus pilot | Agreed, with a caveat. No live run of the skill loop exists yet. The replay drove only the final-review node, and this review walked the CLI, not the skill. The first live loop is the M13 pilot. |
| T9 C1: verdicts move to `.workflow/work/` | **Agreed on the move, wrong on "cost if wrong: none".** It removed the only mechanical guard on who writes a verdict. See I3. |
| T9 C3b: fix PR mergeable by the graph via `--branch` | Agreed (measured end to end). |
| T9 `reviews_dir = docs/reviews` | Agreed. |
| T9 C2 (one late implement round) and C3a (a red deploy escalates) accepted as deviations | Agreed. C3a is stricter than the spec, which is safer. |
| T9 I1: resume refunds the round; skill globs `report_path`; every running node counts as interrupted after a restart | Agreed. The refund is unbounded (M5), which is acceptable while restarts are the author's. |
| T10: add `wf clear` | **Agreed that it was a real gap, but incomplete.** Nothing stops the orchestrator running it, and the note is stamped `author:`. See I1. |
| T11: blind replay prompt, worktree at `544bbf2` | Agreed. The build-deploy hint is mild and declared. |
| T11: keep the untrimmed baseline | Agreed. Post-review fix work is M11's cost. |
| T11: dedupe by `message.id`, keeping the last line | Agreed. Both the method and the resulting 6.89M look right. The pilot must use the same method, which it is not yet told to do (I4). |

### Declined to judge

- **The skill as a live orchestrator would follow it.** I walked its table by hand against the CLI, but no agent dispatch, `get_usage`, `PushNotification` or `/loop` wakeup ran. Wording problems can still surface in the M13 pilot.
- **Real GitHub behaviour of `setup`, `merge` and `post-*`.** I used a fake `gh` that mimics the JSON shapes. URL and branch-name PR arguments to the hook were not exercised against real `gh`.
- **Whether the PreToolUse payload identifies subagent calls** (I3, fix a). Not verified in this Claude Code version.
- **Local Playwright under throttle.** Taken from the CI runs only.
- **The replay's numbers.** Taken as reported; I did not re-run the replay.

### Recommendations

1. Fix I1 and I2 together in `state.py`/`cli.py`: `finish` only from `running`, records required for `done`, escalated nodes leave only by `clear`. Add the `wf clear` block to `guard-state.sh`. This is one small PR with tests, and it turns the anti-goal 2 and 5 rails from instruction into code, as the merge rail already is.
2. Fix I4 in `retro.md` and the skill's `{baseline}` before M13 starts, because the pilot verdict depends on it.
3. Decide I3's mechanism, or record it in §11 as a known gap.
4. Cheap while there: M2 (hook prefix), M3 (past reset), M6 (root-relative verdict paths), M7 (hook stderr), and the two doc one-liners from the triage.
5. Skip the `get_usage` call before script nodes. Their estimate is always 0, which saves about 3k tokens per task.

### Assessment

**Ready to merge? With fixes.**

The engine is well built and well tested. Every Review Focus item holds as stated, except a narrow edge of item 4 (M3). The merge rail, the part with the most at stake for `main`, is enforced in code, in the hook and in GitHub, and resisted every command shape I tried. The anti-goal 1 replay passed blind.

The spec's other hard rails rest on the skill's instructions alone, which is the drift approach C was chosen to remove:
- **Escalations (I1):** a red deploy can be finished `done`, or cleared with an `author:` note, by the orchestrator.
- **Silent advance (I2):** a run reaches `done`, final review included, with zero gate or review records.
- **Verdict authorship (I3):** nothing checks who wrote a verdict.

The pilot's cost measure (I4) would also not be comparable with the baseline it is judged against. None of these breaks normal operation, so none is critical. All four should be fixed, or explicitly accepted by the author, before M13 relies on the graph. The minors can be taken or deferred.
