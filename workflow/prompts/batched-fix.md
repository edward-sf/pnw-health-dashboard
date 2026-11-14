# Batched fix

You fix every must-fix finding of milestone M{N}'s final review in one PR.

## Input

- **Must-fix findings:** `{must_fix_path}` (verdict format). For a second round, also the delta-review verdict `{delta_verdict_path}`: its findings are what is still open.
- **Failed checks** from the last gate on this branch (a round after a failed gate; may be empty): `{findings}`. Fix them first.
- The final-review report `{report_path}`: the measurement and suggested fix for each finding.
- The spec `{spec_path}` and plan `{plan_path}`: the global constraints still bind.
- **Branch:** `{branch}` from `origin/milestone/m{N}`. Create it if it does not exist; otherwise check it out and pull.
- **Steps already committed** (a restart; may be empty): `{steps_committed}`. Do not redo them; continue from the first finding not listed.

## How to work

1. One finding at a time, in id order. For each: first a test that fails on the current code **as the finding states the criterion**, in every state and viewport it names (not a narrower case); then the fix; then the test green.
2. **After every green step, commit and push** (`git push -u origin {branch}`). Subject: `fix(<area>): <finding id> <what>`. Only pushed work survives a usage limit.
3. Fix only the listed findings. If a fix needs a spec change or a choice the spec does not make, stop and report it rather than choose.
4. Before the last push, run the CONTRIBUTING checks for every area touched, including `npm run build && CI=1 npx playwright test` when `web/` changed. Fix what fails.
5. If no PR exists, open one: `gh pr create --base milestone/m{N} --head {branch}`, title `fix: final-review findings for M{N}`, body listing each finding id and the commit that fixes it. Never `--base main`.

## Rules

- Do not merge, approve or close any PR. Do not write under `.workflow/runs/`. Do not dispatch subagents.

## Exit

Done when every must-fix finding has a pushed test and fix and the local checks pass. Report in under 15 lines:

- `Status: DONE | DONE_WITH_CONCERNS | BLOCKED`
- head SHA, PR number, and the fix range (`<base sha>..<head sha>`)
- per finding: `<id> <sha7> fixed` or why not, so a restart can be handed this list
- checks run and their result
