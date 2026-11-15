# Milestone retro

You turn milestone M{N}'s run into numbers and guards, so later milestones don't pay for the same findings again.

## Input

- **Run state:** `{status_path}` (the output of `wf status`): node statuses and rounds, gate and review records, usage samples (`pct_before`, `pct_after`, `tokens` per agent node), escalations.
- Every verdict the run state's `reviews` list points to, the final-review report `{report_path}`, the triage `{triage_path}`, and the delta-review verdicts.
- `build-deploy` history: `gh run list --workflow build-deploy.yml --branch milestone/m{N} --limit 50 --json conclusion,headSha,createdAt,url`.
- The M11 baseline for the pilot targets: `{baseline}` (`wf baseline` output for M11). Its cache reads are in `notes`; per task that is 171,892,946 / 8, about 21.5M.

Read only. Do not edit code, merge or push anything except the file below.

## Measure the run the way M11 was measured

Target 3 is judged only on `wf baseline`, the same method and flags as M11, never on the per-node `tokens` in run state (a different counter that leaves out the orchestrating session):

```
uv run --project workflow wf baseline --milestone {N} --since <start> --until <now> \
  --branch milestone/m{N} --tasks <task count> --fix-prs <fix PR numbers, comma-separated> \
  --transcripts {transcripts_dir}
```

- `<start>`: the earlier of the first commit on `milestone/m{N}` that is not on `main` (`git log --reverse --format=%cI origin/main..origin/milestone/m{N} | head -1`) and `first_at` from `wf usage-total` below, rounded down to the hour, as M11's was. `<now>`: the current UTC time. Check the sessions in its `notes` all belong to this run, and list them.
- `<task count>`: the tasks in the task graph. `<fix PR numbers>`: the PRs merged after the final review.

Then run `uv run --project workflow wf usage-total --milestone {N}`. Its `pct_used` is the 5-hour-window percent the whole run used, orchestration included, from every `get_usage` reading `wf next` was given (first to last, across `windows` windows).

## Write `docs/reviews/{date}-m{N}-retro.md`

1. **Tokens per node.** A table: node, model, rounds, tokens, percent of the 5-hour window, from the run state's usage samples. Totals per node kind. These are subagent counts, for finding the expensive nodes only.
2. **Run cost**, from the measurements above, next to M11's: tokens per task (`tokens_per_task`), cache reads per task (the `notes` cache reads divided by the task count; M11: about 21.5M), and the total 5-hour-window percent (`pct_used` and `windows` from `wf usage-total`; M11: not recorded). The gap between the run's token total and the sum of the per-node tokens is the orchestration cost.
3. **Rounds per loop**, against budget (spec §5.2): implement↔gates (3/task), task-review (2/task), deploy-watch (1 per red run), final-review (1), batched-fix (2). Name every loop that used more than one round and why.
4. **Escalations.** Each one: node, reason, what the author decided.
5. **Pilot targets** (spec §5.10), each met or not, with the number:
   - no more than one fix PR after the final review (M11: three, #248, #250, #251)
   - no red `build-deploy` after a merge
   - tokens per task at least 30% below M11's, from `wf baseline` only (M11: 861,550; target at most 0.60M)
6. **Findings that escaped a layer.** Every final-review finding the task reviews passed, and every red `build-deploy` the gates passed. For each: which layer should have caught it, and why it did not.
7. **Guard proposals.** For each escaped finding and each extra round, at most one guard. Each guard is exactly one of:
   - a **test**: what it asserts, and the file it goes in;
   - a **constraint**: the sentence, and where it goes (a plan template's Global Constraints, `CONTRIBUTING.md`, the spec template);
   - a **checklist line**: the line, and the file (`docs/milestone-review-template.md`, a prompt under `workflow/prompts/`).

   Propose no guard that costs more than the finding it prevents (spec anti-goal 4). Rank them by how much they would have saved.

Keep it under 150 lines. Numbers come from the inputs; where one is missing, write "not recorded" rather than estimate.

## Exit

Done when the file is written and committed on `milestone/m{N}` (`docs: M{N} retro`) and pushed. Report in under 10 lines: the pilot targets met / not met, the top three guards, and the commit SHA.
