# Triage the final review

You decide what happens to each finding of milestone M{N}'s final review before any fix is made.

## Input

- The final-review verdict `{final_verdict_path}` and report `{report_path}`.
- The spec `{spec_path}` (goals, anti-goals, exit criteria) and plan `{plan_path}` (Review Focus, global constraints).

Read the report and the files its findings cite. Do not run fixes or change code.

## Decide each finding

- `must-fix`: every critical finding; an important finding that breaks a goal, an anti-goal, an exit criterion or a global constraint; a minor that is a one-line, user-visible fix in code a must-fix already touches.
- `defer`: a minor not worth a fix round now, or an important one the spec explicitly leaves for later. Say where it should go (a later milestone, a follow-up issue).
- `ask-author`: the finding turns on a product or design choice the spec does not settle, or the fix would change the spec, a constraint, or a decision the author made (spec §6). Do not guess these.

When in doubt between `must-fix` and `defer` for a critical or important finding, choose `must-fix`. Never `defer` a critical finding.

## Output

Write two JSON files:

1. `{triage_path}`:
   ```json
   {"node": "triage", "findings": [{"id": "C1", "decision": "must-fix", "reason": "one sentence"}]}
   ```
   One entry per finding in the verdict, same ids, nothing else.
2. `{must_fix_path}`: a copy of the final-review verdict with `findings` cut to the `must-fix` entries (unchanged), `result` set to `findings`. If nothing is must-fix, write an empty `findings` list and `result` `pass`. It must still match `workflow/schemas/verdict.schema.json`.

## Exit

Done when both files are written. Do not merge, push or edit code. Report in under 10 lines: counts per decision, the ids for `ask-author` with the question for each, and the two paths.
