# M12 Workflow Engineering — design

**Date:** 2026-11-14 · **Milestone:** M12 - Workflow Engineering · **Status:** built in M12; see §11 for deviations

## 1. Intent

Milestones M1–M11 used an agentic workflow that works but costs too much. Most of the cost is agent tokens and rounds of fixes. M12 turns that workflow into an **orchestrated graph**: it runs from an approved plan to a ready milestone PR on its own, and stops for the author only at named gates. If the results are good, the graph graduates to the author's Standards and Skills repos.

The author's measure of success is lower agent cost, meaning fewer tokens and fewer fix rounds, while keeping both review layers:

- **Task review** is a scoped check of one task against its plan section. It is worth keeping, but it cannot see cracks forming across the branch.
- **Final whole-branch review** earned its keep. It caught build breaks and contract violations that task reviews missed, such as M11's C1, where the map moved when the measure changed, against spec §1 anti-goal 1. It must not be weakened.

## 2. The workflow today (baseline)

1. **Spec.** Brainstorm, then write a design spec (`docs/superpowers/specs/`). The spec states anti-goals.
2. **Plan.** Write the milestone plan just in time (`docs/superpowers/plans/`). It holds the global constraints, the Review Focus list, a file map, and tasks with interfaces and tests.
3. **Task 0 setup, by hand.**
   - Add the roadmap section and create the issues.
   - Open the `docs/m<N>-plan` PR.
   - Create `milestone/m<N>` and open a draft milestone PR.
4. **Per task, by a subagent.**
   - Branch, implement with TDD.
   - Run lint, typecheck and unit tests, plus local e2e with `CI=1`.
   - Open a PR, then run a task review against the plan.
   - Squash-merge (the guard hook allows only `milestone/*` bases), then watch `build-deploy`.
5. **Final whole-branch review.** Findings are fixed in follow-up PRs. The report and outcomes go to `docs/reviews/`.
6. **Author review** using `docs/milestone-review-template.md`, then a merge commit to `main`.

Where the cost and waste come from:

- **Agents do mechanical work.** They watch CI, retarget stacked PRs, fill templates, set up Task 0, and close and reopen PRs to trigger CI.
- **Reviewers rebuild context** by exploring instead of being handed it.
- **Problems surface late, which costs rounds.** In M11 there were three red `build-deploy` runs in a row, each a timing-sensitive e2e test that passed locally. PR `ci` runs no Playwright. Anti-goal violations surfaced only at the final review.
- **Fix loops have no budget.** Nothing says when to stop and ask.
- **Nothing feeds back.** Lessons live only in machine-local memory notes. The merge guard hook lives in git-excluded `.claude/settings.local.json`.
- **The agent workflow is written nowhere in the repo.** CONTRIBUTING covers the GitHub process only.

## 3. Goals, non-goals, anti-goals

**Goals**

1. The graph is defined as data: nodes, edges, gates and budgets in one file.
2. Mechanical nodes are deterministic scripts that spend no tokens.
3. Agents are used only for judgment: implementing, reviewing, fixing and triage. Each runs on a model chosen per node.
4. Every reviewer receives a prepared **context package**.
   - Task and delta reviewers are told not to explore beyond it, except to read the current version of a file where a hunk is not enough.
   - The **final review keeps free access to the repo and the running app.** For it, the package is a head start, not a fence (anti-goal 1).
5. Every loop has a budget. Running out of budget **escalates** to the author; it never retries silently.
6. Hard rules are enforced by hooks, not by instructions alone.
7. Cost is measured: tokens per node and fix rounds per milestone, recorded for each run.
8. A retro node turns each milestone's findings into guards (tests, constraints, checklist lines) so later milestones don't pay for them again.
9. It is portable. Project specifics, such as commands, branch names, labels and paths, live in a config file, separate from the engine.

**Non-goals**

- Replacing the author's milestone review or the merge to `main`. Those stay manual.
- A standalone Agent SDK program (approach B). The graph data is shaped so that it could feed one later.
- Changing the product (pipeline, schema, web) beyond the test or CI changes the gates need. The one planned CI change is the throttled e2e job in PR `ci` (§5.5). It absorbs the open milestone "M? - Playwright e2e in PR checks".
- Parallel task execution. Tasks run in sequence, as today.
- Unattended runs. Runs are **attended**: the author starts one in a Code tab session and may walk away. An escalation stops the run and sends a notification. Picking a run up again in a fresh session is not required.

**Anti-goals** (a failure even if everything else works)

1. **Weaker final review.** Any change that lets something past the final review that the M11 review would have caught.
2. **Silent advance.** A node advancing, merging or skipping a gate without a recorded passing result.
3. **Unbounded loops.** A retry or fix loop that keeps spending past its budget.
4. **Rails that cost more than they save.** Ceremony for its own sake: orchestration overhead that outweighs the savings, measured by goal 7.
5. **Lost authority.** The author's ownership of `main` and of the gates being bypassed or blurred.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | **A skill drives the graph.** The main session follows a skill and keeps a state file. | Cheapest to build. Order is enforced by instruction only, which is the drift we already have. |
| B | **An Agent SDK program.** The graph is a real state machine in code. | Strongest guarantees and exact cost per node. The most to build and maintain, runs outside the Code tab, and is a heavier thing to graduate. |
| **C** | **Hybrid (chosen).** The graph is data, walked by a skill. Mechanical nodes are scripts, hooks enforce the hard rules, and agents run only the judgment nodes. | The best token savings (mechanical work becomes free), real enforcement, and it graduates as a skill plus scripts. Soft parts can still drift; the graph file leaves a path to B. |

The author chose C.

## 5. Design

### 5.1 The graph

```
spec ─▶ [GATE spec] ─▶ plan ─▶ [GATE plan] ─▶ setup*
                                                 │
  ┌───────────────────── for each task ─────────┘
  ▼
implement ─▶ gates* ─▶ task-review ─▶ merge* ─▶ deploy-watch*
   ▲            │ fail        │ findings              │ red
   └────────────┴─────────────┴───────────────────────┘   (each loop budgeted → [GATE escalate])
                                                 │ all tasks merged
                                                 ▼
          final-review ─▶ triage ─▶ batched-fix ─▶ delta-review ─▶ gates* ─▶ milestone-pr*
                                        ▲                │ new must-fix (budgeted)
                                        └────────────────┘
                                                 ▼
                                   retro ─▶ [GATE milestone merge]
```
The retro runs **before** the merge gate. Its summary lands on the milestone branch, as M11's final-review report did in #252. Findings from the author's own review feed the next milestone's retro.
`*` = script node (no tokens).

### 5.2 Nodes

| Node | Kind | Model | Input | Output / exit | Budget |
|---|---|---|---|---|---|
| spec | agent, interactive | strongest | author conversation | approved spec | — |
| plan | agent | strongest | approved spec | approved plan; must contain machine-readable task list, global constraints, Review Focus | — |
| setup | script | — | plan | milestone branch from `main`, roadmap section, issues, committed task graph (`<plan>.tasks.json`: tasks, issue numbers, branches, dependencies both ways, topological order), spec+plan PR squash-merged **into `milestone/m<N>`** (as M11's #237), draft milestone PR | — |
| implement | agent | mid-tier | task package (task section, constraints, interfaces, files) | branch with commits, tests passing locally | shares gate retries |
| gates | script | — | branch | pass/fail record per check, keyed to head SHA | 3 implement↔gates rounds per task |
| task-review | agent | mid-tier | review package (§5.4) | `pass` or findings list (blocking / minor) | 2 review rounds per task |
| merge | script | — | passing gate + review record for head SHA | squash-merged PR, stacked PRs retargeted | — |
| deploy-watch | script | — | milestone branch push | `build-deploy` result | 1 fix round per red run, then escalate (as built: a red run escalates at once; see §11) |
| final-review | agent | strongest | final package (§5.4) | findings report, committed to `docs/reviews/` and **posted as a comment on the milestone PR** | 1 |
| triage | agent | mid-tier | findings | each finding marked must-fix / defer / ask-author | — |
| batched-fix | agent | mid-tier | must-fix list | one fix PR | 2 rounds |
| delta-review | agent | strongest | fix diff and the findings it claims to fix | confirms fixes; flags anything new | inside the batched-fix budget |
| milestone-pr | script | — | run state | milestone PR body filled from run state; a second PR comment with the outcome of every final-review finding (fixed in #…, deferred to #…, ask-author); marked ready | — |
| retro | agent | mid-tier | run state, findings, escalations | guard proposals, filed as issues or a docs PR | — |

The model tiers are configured, not hard-coded. Defaults: strongest = Opus, mid-tier = Sonnet. Any node may be moved to Haiku if measurement shows no loss.

### 5.3 Author gates

- **Spec approval** and **plan approval.** Both happen before any automated run.
- **Escalation.** A budget is spent, a finding needs the author, or a script hits an unexpected state. The run stops with a short report: what was tried, the current state, and the options.
- **Milestone merge to `main`.** It stays the author's. The order is:
  1. The final-review comment and the outcome comment are on the PR.
  2. The author reviews and posts their verdict on the PR.
  3. The author merges by hand with a merge commit.

  The graph never approves or merges a milestone PR. `checkpoint` issues stay the author's.

### 5.4 Context packages

Scripts build packages so that reviewers don't explore:

- **Task review:** the diff, the task's plan section, the plan's global constraints, the spec's anti-goals as a checklist, gate results, and earlier findings on this task.
- **Final review:** the commit range and `--stat`, the Review Focus list, the spec's goals and anti-goals, every task review's outcome and deferred minors, `build-deploy` history for the branch, and the escalation log.
- **Delta review:** the fix diff and the findings it addresses.

### 5.5 Gates script

`gates` runs the CONTRIBUTING checks for the areas touched (pipeline: `ruff`, `mypy`, `pytest`; web: `lint`, `typecheck`, `test`). If e2e may be affected, it also runs `npm run build && CI=1 npm run test:e2e`. New or changed e2e specs additionally run repeated under CPU throttling, so tests that pass on the dev Mac but not on the slower Actions runner fail here (memory note `e2e-only-runs-on-milestone-push`). It records results against the head SHA.

PR `ci` also gains a Playwright job. It runs the e2e suite against a production build, plus new or changed specs repeated under CPU throttling. That way the independent check covers e2e too, and a red `build-deploy` after a merge becomes the exception.

### 5.6 Enforcement (hooks)

- **Merge requires a record.** `gh pr merge` is allowed only when all three hold for the PR's current head SHA:
  - the run state has a passing local gate record
  - the run state has a passing review record
  - GitHub's `ci` check is green This extends `guard-merge.sh`, which keeps its `milestone/*`-only rule.
- **The walker is a script, not the skill.** `wf` (`workflow/src/wf/`) is the only writer of run state. The skill asks it which node comes next and reports results through it. The script refuses to advance a node past its budget and records an escalation instead.
- **Run state is protected.** A PreToolUse hook blocks Edit, Write and Bash writes under `.workflow/runs/` that don't come from the state script.
- **Verdicts come from the reviewers themselves.** Each reviewer writes a structured verdict file, and the state script ingests it. The orchestrating session never writes a verdict itself.
- **The hooks are committed.** They move into the committed `.claude/settings.json`, so they travel with the repo. The `gh pr merge` allow rule stays local if needed for auto mode.

### 5.7 Run state and measurement

- **Location.** Run state lives under `.workflow/runs/m<N>/` (git-ignored). It holds node status, rounds used, gate and review records keyed by SHA, findings and escalations. GitHub stays the source of truth for issue and PR status (CONTRIBUTING).
- **Token measurement.** Each agent node records its token usage, taken from subagent results or session transcripts.
- **Retro summary.** The retro commits a summary to `docs/reviews/`: tokens per node, rounds per loop, escalations, and guards added.

### 5.8 Usage-window pacing

In earlier milestones, subagents ran into the 5-hour usage limit partway through a task and lost work they hadn't saved. Two cheap measures address this.

**Estimate before dispatch, in the window's own unit.**
- Before each agent node, the orchestrating session reads the plan limits with `get_usage`. This is one call, about 1k tokens. It gives the 5-hour and weekly percent used and the reset time.
- The state script records the change in that percent across every agent node it dispatches. Its history is then measured in "percent of the 5-hour window", so no conversion from tokens is needed.
- The estimate is a script computation and costs no tokens:
  - Use the median percent per plan step for that node kind, multiplied by the task's step count.
  - Until there is enough history (fewer than 3 samples), use a conservative default from config.
- **A node fits** if its estimate × 1.5 fits in what is left of the window. The weekly window is checked the same way.
- Most nodes fit easily. In that case the check is one `get_usage` call and a script run.

**Schedule by readiness and fit, not by plan order alone.** Unused window is lost at reset, so the walker fills it with whatever can safely run.
- **Each task declares `depends_on`** in the plan's machine-readable task list. A task depends on another if it:
  - consumes an interface the other produces (the plan's Interfaces blocks), or
  - touches a file the other touches (the plan's file map).

  File overlap counts because a task cut from the milestone branch before the other one merges would conflict with it. The plan node derives these dependencies, and they are checked at the plan gate.
- **A node is ready** when everything it depends on has merged. Review, fix and retro nodes are ready once the node they act on is done.
- **The walker dispatches the earliest ready node, in plan order, that fits.** In the example of 3% left and ready tasks costing 4%, 2% and 1%: the 2% task runs, then the 1% task if what is left still covers it with margin, and the 4% task waits for the reset.
- **A fresh window always starts with the earliest ready node.** That stops a large task being skipped over and over.
- **If no ready node fits,** the walker pauses until `resetsAt`, records why, and notifies the author.
- Only one node runs at a time (non-goal: parallel execution). The walker reorders work; it doesn't overlap it.

**Checkpoint so an interruption loses at most one step.**
- Implementing and fixing agents commit and push at every green TDD step. The plan already allows small commits.
- If a node dies partway, the walker restarts it from the pushed branch. The restarted node gets its package plus a list of the steps already committed.
- Estimates will sometimes be wrong. Checkpointing makes a wrong one cheap.

The 1.5 margin, the default estimate and the sample threshold are configured in `project.toml`.

### 5.9 Files (proposed layout)

- `workflow/graph.toml`: nodes, edges, budgets, model tiers. Generic.
- `workflow/project.toml`: this repo's commands, paths, labels and branch patterns.
- `workflow/src/wf/`: the `wf` CLI. Its commands are `init`, `check-plan`, `setup`, `status`, `gate`, `start`, `finish`, `resume`, `escalate`, `next`, `package`, `ingest`, `check-merge`, `merge`, `deploy-watch`, `milestone-pr`, `post-final-review`, `post-outcomes` and `usage`.
- `workflow/prompts/`: one prompt per agent node.
- `.claude/skills/run-milestone/SKILL.md`: walks the graph, dispatches agent nodes with their packages and models, and calls the scripts.
- `.claude/hooks/`: the merge-record guard.
- CONTRIBUTING gains an "Agent workflow" section that points at the graph.

### 5.10 Pilot

M12 itself is built with the current workflow.

**Replay test, inside M12.** Before the graph is used for real, run the new final-review node on M11's range (`8960663..544bbf2`) with the new package. It passes if it still reports C1, the map moving across measures and Show states, and I1–I2: the phone map's top position and the 24×24 targets. If it misses any of them, the final-review design is revised before the pilot. This is the evidence for anti-goal 1.

**Pilot: M13 Branding.** The first real run of the graph. The baseline is M11, with tokens read from the author's local session transcripts. The graph is judged good, and fit to graduate to Standards and Skills, if M13 meets all three:
- no more than one fix PR after the final review (M11 had three: #248, #250, #251)
- no red `build-deploy` after a merge
- tokens per task at least 30% below M11's

## 6. Decided by the author

- Both review layers stay; the aim is to make each cheaper.
- The cost to cut is agent cost (tokens, fix rounds), not the author's reading time.
- The graph is orchestrated and runs alone between named gates.
- Approach C, the hybrid.
- Runs are attended.
- A throttled e2e job goes into PR `ci` within M12.
- The pilot targets in §5.10. The M11 baseline is read from local transcripts.
- M12 includes the M11 replay test.
- The final review is posted as a comment on the milestone PR. After the fixes and deferrals, the author adds their own verdict and merges to `main` by hand.

## 7. My calls (the author can overturn them)

- The specific gates (§5.3), budgets (§5.2) and model tiers.
- Scripts in Python with no runtime dependencies: the standard library at runtime (`tomllib`, `json`, `subprocess`, `gh`), run through `uv` on Python 3.12 (`uv run --project workflow wf <command>`). The original call was "standard library only, so no install". `uv` is already a project tool, and it gives a pinned interpreter, a lockfile and dev-only tooling (`ruff`, `mypy`, `pytest`) for the engine, so the scripts are tested to the same standard as the pipeline. The graph is in TOML for the same reason.
- Run state is git-ignored, and only the retro summary is committed.
- Tasks run in sequence.
- The pilot is M13.
- The walker is the state script. It is the only writer of run state, and a hook protects that state (§5.6).
- Reviewers write their own verdict files.
- The final review keeps free access to the repo (goal 4).
- The spec and plan PR and the retro both land on the milestone branch.
- A merge needs the local gate record, the review record and a green `ci`.

## 8. Left to the builder

- Script interfaces and the run-state schema.
- How the plan's task list is made machine-readable: a structured block in the plan, or parsing headings.
- The throttling mechanism for the e2e repeat, and how many repeats.
- How token usage is read.
- How stacked PRs are retargeted, following memory note `landing-stacked-issue-prs`.

## 9. Housekeeping in scope

- Bring `docs/milestone-review-template.md` up to date: its milestone-specific checks stop at M6.
- Move the lessons in the machine-local memory notes into repo docs, where the graph and its scripts can use them.

## 11. As built

Where M12's build differs from the design above, and why. The rulings were made during the build; the author can overturn them in the milestone review.

**Runtime and layout**
- **Python 3.12 through `uv`**, with no runtime dependencies (§7). The CLI is `uv run --project workflow wf <command>`, one entry point instead of separate scripts. Prompts live in `workflow/prompts/`.
- **Verdict files are under `.workflow/work/m<N>/verdicts/`**, not under the protected `.workflow/runs/`. A reviewer subagent has to write its own verdict, and the state hook blocks writes under the runs directory. `wf ingest` still validates each verdict against the head SHA and records it in run state, so only `wf` writes records.
- **The state hook is a drift guard, not a security boundary.** It matches Bash commands by pattern, so a determined command can get around it.

**Scheduling (§5.8)**
- **A `waiting` decision.** When a node is still running (a background deploy-watch) and nothing else is ready, `wf next` returns `waiting`, not a dispatch or a pause. A task in the graph but missing from run state is an error.
- **Same-window tolerance.** `resetsAt` jitters by a few hundred milliseconds between `get_usage` calls for the same window, so two windows are the same when their reset times differ by less than 5 minutes. Without it every call would look like a fresh window.
- **Oversized estimates.** A node is blocked outright only when its estimate times the margin exceeds a whole window. One that merely does not fit what is left pauses until the reset.
- **Unavailable usage.** When `get_usage` is unavailable or not applicable, the walker dispatches the earliest ready node without a fit check and records `pacing: off` for that decision.

**Loops and budgets (§5.2)**
- **Red deploys escalate.** The design gave deploy-watch one fix round per red run. As built, a red or timed-out `build-deploy` escalates to the author, who decides the fix.
- **One late round on review budget.** The task-review budget is checked when the next review starts, so after the last allowed review round finds problems, one more implement and gates round runs before `wf start` refuses the review and escalates.
- **The fix PR is merged by the graph.** `wf start batched-fix --branch <b>` records the fix branch. `wf merge` maps that branch to a `batched-fix` gate record and a `delta-review` record, so the fix PR merges under the same record rules as an issue PR.
- **Merge hardening.** `wf merge` passes `--match-head-commit`, so a push between the record check and the merge is refused. The merge hook resolves the PR number and base with one `gh pr view` and blocks if that lookup fails. `wf check-merge` finds the task by matching the PR's head branch to the task graph.

**Setup (§5.2)**
- **Re-runs.** If the plan PR's branch already has an open PR, `wf setup` builds on it; if that branch has a merged or closed PR, it uses `docs/m<N>-plan-<k>` for the next free `k`. A closed, unmerged milestone PR is an error, never a duplicate. The plan PR is merged with `--delete-branch`.
- **`reviews_dir`** is `docs/reviews`, where reviews already live.

**CI and e2e (§5.5)**
- **The e2e job is in PR `ci`** (#295), and `ci` needs it. New or changed specs are repeated 3 times at 4x CPU throttle (`E2E_CPU_THROTTLE`), in the gate and in CI. e2e also still runs on milestone pushes in `build-deploy`, and the job runs on pushes too, which duplicates that.
- **A `workflow` job** runs `ruff`, `mypy` and `pytest` for the engine, and is in `ci`'s `needs`.

**Known minors, left to the final review's triage.** Run state has no file locking (the walker is serial). The merge hook fires on any command whose text merely mentions the merge phrase, and the state hook can false-positive on a heredoc that names the runs path with `>` (use a body file). The replay and the pilot in §5.10 are task T11 and M13.
