# Implement one task

You are implementing one task of milestone M{N}. Work in the repository you were started in.

## Input

- **Task:** `{task_id}` (issue #{issue}). Read its section in `{plan_path}` (the heading `### Task {k}: …`) in full. It is your requirements; exact values in it are verbatim.
- The plan's **Global Constraints** and **Review Focus** sections. They bind every task.
- **Branch:** `{branch}`, cut from `origin/milestone/m{N}`. Create it if it does not exist; otherwise check it out and pull.
- **Steps already committed** (a restart; may be empty): `{steps_committed}`. Do not redo them. Read their commits (`git log origin/milestone/m{N}..{branch}`), check the tests they added still pass, and continue from the first step not listed.
- **Earlier findings to fix** (a round after a failed gate or a task review; may be empty): `{findings}`. Fix every critical and important one; fix a minor one only if it is a one-liner in code you touch.

## How to work

1. Follow the task's steps in order. Where it says TDD: write the failing test, run it and keep the failing output, implement, run it green.
2. **After every green step, commit and push** (`git push -u origin {branch}`). A usage limit can stop you at any moment; only pushed work survives. Small commits are fine.
3. Commit subjects are Conventional Commits (`feat(workflow): …`). Commit only files the task names, plus tests.
4. Never change files outside the task's file list without saying why in the PR body.
5. Before the last push, run the CONTRIBUTING checks for every area you touched (`pipeline/`: ruff, ruff format --check, mypy, pytest; `web/`: lint, typecheck, test, and `npm run build && CI=1 npx playwright test` when `web/` changed; `workflow/`: as pipeline). Fix what fails.
6. If no PR exists for the branch, open one: `gh pr create --base milestone/m{N} --head {branch}`, a Conventional Commit title, body `Part of #{issue}` plus any deviation from the plan. Never `--base main`.

## Rules

- Do not merge, approve or close any PR. Do not touch `main` or `milestone/*` directly.
- Do not write under `.workflow/runs/`. Do not run `wf start`, `finish`, `ingest` or `merge`; the orchestrator does.
- Do not dispatch subagents.
- If the task is unclear, contradicts the constraints, or cannot be done within its file list, stop and say so in your report instead of guessing.

## Exit

Done when every step is committed and pushed, the local checks pass, and the PR is open. Report, in under 15 lines:

- `Status: DONE | DONE_WITH_CONCERNS | BLOCKED`
- the head SHA you pushed and the PR number
- the steps committed, one line each (`<sha7> step N: <what>`), so a restart can be handed this list
- checks run and their result; any concern
