# Agent workflow (`wf`)

An orchestrated graph that takes a milestone from an approved plan to a ready milestone PR. Mechanical steps are scripts that spend no tokens. Agents run only the judgment nodes (implement, review, triage, fix, retro). Hooks enforce the hard rules. The author stays in charge of `main`.

Design: [`docs/superpowers/specs/2026-11-14-m12-workflow-engineering-design.md`](../docs/superpowers/specs/2026-11-14-m12-workflow-engineering-design.md) (see its section 11 for how the build differs from the design).

## The graph

```
spec ─▶ [GATE spec] ─▶ plan ─▶ [GATE plan] ─▶ setup*
                                                 │
  ┌───────────────────── for each task ─────────┘
  ▼
implement ─▶ gates* ─▶ task-review ─▶ merge* ─▶ deploy-watch*
   ▲            │ fail        │ findings              │ red
   └────────────┴─────────────┘                       └─▶ [GATE escalate]
                                                 │ all tasks merged
                                                 ▼
  final-review ─▶ triage ─▶ batched-fix ─▶ delta-review ─▶ final-gates* ─▶ milestone-pr* ─▶ retro
                                ▲                │ new must-fix (budgeted)
                                └────────────────┘
                                                 ▼
                                      [GATE milestone merge: the author]
```

`*` is a script node. Spec and plan are author-gated and happen before a run. The graph itself is data in `workflow/graph.toml` (nodes, edges, budgets, model tiers). `workflow/project.toml` holds this repo's specifics.

| Piece | Where |
|---|---|
| Walker, state, scripts | `workflow/src/wf/` (run as `uv run --project workflow wf <command>`) |
| Agent prompts | `workflow/prompts/` |
| Orchestrating skill | `.claude/skills/run-milestone/SKILL.md` |
| Hooks (committed) | `.claude/hooks/guard-merge.sh`, `.claude/hooks/guard-state.sh`, wired in `.claude/settings.json` |
| Run state (git-ignored) | `.workflow/runs/m<N>/state.json`; scratch and verdict files in `.workflow/work/m<N>/` |

Every command prints JSON on stdout. On an expected failure it exits non-zero with one line on stderr: `1` a check failed, `2` refused or unreadable, `3` deploy-watch timed out.

## Starting a run

1. Write and merge the spec and plan. The plan carries a `workflow-tasks` block (see the M12 plan for the format). Check it:
   ```bash
   uv run --project workflow wf check-plan docs/superpowers/plans/<plan>.md
   ```
   It lists every problem: a missing block, an unknown `depends_on` id, a cycle, or an undeclared file overlap between tasks.
2. Set the milestone up (this replaces the old by-hand Task 0). It creates the milestone branch, roadmap section, issues, the committed task graph (`<plan>.tasks.json`), merges the spec and plan PR into the milestone branch and opens the draft milestone PR. It refuses before creating anything if the plan has problems.
   ```bash
   uv run --project workflow wf setup --milestone <N> --plan <plan.md> --spec <spec.md>
   ```
3. In a Claude Code session, run `/run-milestone <N>`. To keep it going across usage-window pauses, run it under `/loop`: `/loop /run-milestone <N>`.

A new session picks up an existing run: the skill resumes any node left `running`. Run `uv run --project workflow wf status --milestone <N>` any time to see the run state: nodes, rounds used and escalations.

## Gates and what stops a run

Gates the author owns: spec approval, plan approval, escalations, and the milestone merge to `main`. The graph never approves or merges a PR into `main` and never closes `checkpoint` issues.

**Merge needs records.** `wf merge` (and the merge hook) require, for the PR's current head SHA: a passing local gate record, a passing review record, and a green `ci` check. A new commit invalidates both records. The local gate runs the checks for the touched areas, plus e2e (and a throttled repeat of new or changed e2e specs) when `web/` is touched.

**A pause** is not a failure. The walker has no ready node that fits the usage window, so it records why and waits until the window resets (`wf next` returns `pause` with an `until`). Under `/loop` the skill schedules its own wake-up.

**An escalation** stops the run and notifies the author. It happens when a budget is spent, a reviewer finding needs the author, a script hits an unexpected state, or `build-deploy` goes red. `wf status` shows each escalation's node and reason. The run state keeps what was tried. To continue after you have decided, fix the cause and have the skill resume the node (`wf resume <node>`); a budget that was spent stays spent unless you change it (below).

**Reviewers write their own verdicts** to `.workflow/work/m<N>/verdicts/`; `wf ingest` records them. The orchestrating session never writes a verdict.

## Changing budgets, tiers and pacing

- **Budgets:** `budget` on each node in `workflow/graph.toml` (implement 3 rounds, task-review 2, deploy-watch 1, final-review 1, batched-fix 2).
- **Model tiers:** `[tiers]` in `workflow/graph.toml` (`strongest = "opus"`, `mid = "sonnet"`) and each node's `tier`. The skill passes the decision's model to the Agent tool, so a change here takes effect on the next dispatch.
- **Pacing:** `[pacing]` in `workflow/project.toml`:
  - `margin = 1.5`: a node fits if its estimate times this fits in what is left of the 5-hour window (the weekly window is checked the same way).
  - `min_samples = 3`: below this many recorded samples, use the default.
  - `default_pct_per_step = 0.5`: percent of the 5-hour window per plan step, until there is history.
- **Gate commands:** `[areas.*]` and `[e2e]` in `workflow/project.toml`.

Spent budgets recorded in an existing run's state do not reset when the config changes; raise a budget before the run reaches it.

## Generic and project-specific

For graduating the graph to the author's Standards and Skills repos.

| Generic (moves as is) | Project-specific (rewritten per repo) |
|---|---|
| `workflow/src/wf/` engine: state, scheduler, walker, verdicts, packages | `workflow/project.toml`: repo, branch patterns, paths, area commands, e2e, pacing |
| `workflow/graph.toml` shape (nodes, edges, budgets, tiers) | the `area:` and `type:` labels `wf setup` applies; the project board |
| `.claude/skills/run-milestone/SKILL.md` | `deploy_workflow` and the `build-deploy` check; the Playwright e2e gate |
| `.claude/hooks/` (merge record guard, run-state guard) | the plan's file map, Review Focus and spec anti-goals the packages quote |
| Prompts in `workflow/prompts/` (mostly; they name `docs/reviews/`) | CONTRIBUTING's branch model and issue lifecycle |

## Lessons

Two machine-local memory notes held what this project learned the hard way. Each is now a rule here, with the guard that enforces it.

### E2E and the slower runner

1. **Run e2e from a production build with `CI=1`:** `cd web && npm run build && CI=1 npx playwright test`. Without `CI`, `web/playwright.config.ts` reuses a server already on port 4173, so a leftover `vite preview` tests a stale build.
   - Guard: `wf gate` runs e2e as `npm run build` then `CI=1 npx playwright test`. Hand-run commands are not enforced.
2. **The Actions runner is several times slower than a dev Mac.** In M11 three tests that passed locally failed `build-deploy` one after another: a keyboard step before a Radix menu mounted, a vaul drawer dragged inside its post-open lockout, and a 3.2M-point scan that hit the 30s timeout. Wait on observable conditions rather than fixed sleeps, and keep each test well under the timeout at 4x throttle.
   - Guard: new or changed e2e specs are repeated three times under `E2E_CPU_THROTTLE=4` by `wf gate` (`[e2e]` in `project.toml`) and by the PR `ci` e2e job. Test design itself (no fixed sleeps) is not enforced.
3. **PR `ci` used to skip Playwright**, so a broken e2e test passed locally and in the PR, then failed `build-deploy` for two merges (M6). Since #295 the PR `ci` runs the e2e suite, and `ci` requires it.
   - Guard: the `e2e` job is in `ci`'s `needs`, and `wf merge` requires a green `ci`. e2e also still runs on milestone pushes via `build-deploy`.
4. **After each merge, check `build-deploy` on the milestone branch**, not just the PR checks. A contract bump once broke the site there while PR checks stayed green.
   - Guard: the `deploy-watch` node polls `build-deploy` for the merge commit. A red or timed-out run escalates; the graph never auto-fixes it. Outside a run: not enforced.

### Landing issue PRs

1. **Merge issue PRs only into `milestone/*`.** The author merges milestone PRs into `main`. In auto mode a merge also needs the local allow rule for the command.
   - Guard: `.claude/hooks/guard-merge.sh`, committed in `.claude/settings.json`. It blocks any merge whose base is not `milestone/*`. The allow rule stays local (`.claude/settings.local.json`).
2. **Never delete a PR's base branch before dependent PRs are retargeted** (it auto-closes them), and update a PR by merging the milestone branch into it, not by rebasing or force-pushing. `gh pr edit --base` does not trigger `ci` (an `edited` event), so close and reopen the PR to start it.
   - Guard: not enforced. These stop arising inside a run: tasks start only after every dependency has merged, so stacked issue PRs do not exist, and `wf merge` squash-merges one PR into an up-to-date milestone branch.
3. **A merge needs a passing gate record, a passing review record and a green `ci`, all for the head SHA.**
   - Guard: the same hook calls `wf check-merge` for any PR whose milestone has a run, and `wf merge` passes `--match-head-commit` so a push between the check and the merge is refused.

### Working with the hooks

- **The merge guard fires on any command whose text contains the merge phrase**, including an `echo`, a commit message or a ledger note that merely mentions it. Keep that phrase out of commands that do not merge. To record text that mentions it, write it with the Edit or Write tool rather than the shell.
- **The state guard blocks shell commands that mention `.workflow/runs` together with `>`**, which includes a heredoc whose body names the runs path. Put such text in a body file (written with Write) and pass the file, for example `gh pr comment --body-file`; never write under `.workflow/runs/` yourself. Run `wf` from the repo root, starting the command with `uv run --project workflow wf`.
- **Both hooks are drift guards, not security boundaries.** They match patterns, so a determined command can get around them. They stop the honest mistake.
