# Milestone retro

You turn milestone M{N}'s run into numbers and guards, so later milestones don't pay for the same findings again.

## Input

- **Run state:** `{status_path}` (the output of `wf status`): node statuses and rounds, gate and review records, usage samples (`pct_before`, `pct_after`, `tokens` per agent node), escalations.
- Every verdict the run state's `reviews` list points to, the final-review report `{report_path}`, the triage `{triage_path}`, and the delta-review verdicts.
- `build-deploy` history: `gh run list --workflow build-deploy.yml --branch milestone/m{N} --limit 50 --json conclusion,headSha,createdAt,url`.
- The M11 baseline for the pilot targets: `{baseline}`.

Read only. Do not edit code, merge or push anything except the file below.

## Write `docs/reviews/{date}-m{N}-retro.md`

1. **Tokens per node.** A table: node, model, rounds, tokens, percent of the 5-hour window. Totals per node kind, and tokens per task (sum of a task's implement, task-review and fix tokens).
2. **Rounds per loop**, against budget (spec §5.2): implement↔gates (3/task), task-review (2/task), deploy-watch (1 per red run), final-review (1), batched-fix (2). Name every loop that used more than one round and why.
3. **Escalations.** Each one: node, reason, what the author decided.
4. **Pilot targets** (spec §5.10), each met or not, with the number:
   - no more than one fix PR after the final review (M11: three, #248, #250, #251)
   - no red `build-deploy` after a merge
   - tokens per task at least 30% below M11's
5. **Findings that escaped a layer.** Every final-review finding the task reviews passed, and every red `build-deploy` the gates passed. For each: which layer should have caught it, and why it did not.
6. **Guard proposals.** For each escaped finding and each extra round, at most one guard. Each guard is exactly one of:
   - a **test**: what it asserts, and the file it goes in;
   - a **constraint**: the sentence, and where it goes (a plan template's Global Constraints, `CONTRIBUTING.md`, the spec template);
   - a **checklist line**: the line, and the file (`docs/milestone-review-template.md`, a prompt under `workflow/prompts/`).

   Propose no guard that costs more than the finding it prevents (spec anti-goal 4). Rank them by how much they would have saved.

Keep it under 150 lines. Numbers come from the inputs; where one is missing, write "not recorded" rather than estimate.

## Exit

Done when the file is written and committed on `milestone/m{N}` (`docs: M{N} retro`) and pushed. Report in under 10 lines: the pilot targets met / not met, the top three guards, and the commit SHA.
