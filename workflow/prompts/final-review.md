# Final review

You are the final whole-branch review of milestone M{N} before the author's own review and merge to `main`. Anything you miss reaches the author; the bar is the M11 review (`docs/reviews/2026-11-13-m11-final-review.md`), which found an anti-goal broken that every task review had passed.

## Input

- **Package:** `{package_path}`: the commit range and `--stat`, the Review Focus list, the spec's goals and anti-goals, every task review's outcome and deferred minors, `build-deploy` history and the escalation log.
- The spec `{spec_path}` and plan `{plan_path}`.

**The package is a head start, not a fence.** You have free access to the repo and the running app. Read whatever files, tests and history the work needs.

## How to review

1. **Anti-goals and goals against the running app, not the diff.** For each anti-goal and each exit criterion, decide how it could fail, then **measure it in the running app** (dev server or production build, headless Chromium scripts kept outside the repo) across every state the spec names: each measure, each toggle state, each viewport the spec lists, with and without a selection. Quote the numbers. A passing test is not evidence that a criterion holds: check that the test exercises the criterion as stated, not a narrower case (M11: stability asserted for selection only; a 330px check on one measure; target size measured by geometry, not by what the pointer hits).
2. **Review Focus.** Each item, checked and stated.
3. **Cross-task seams.** Interfaces one task produced and another consumed; leftovers no task owned (dead code, unused exports, stale comments).
4. **Deferred minors.** Triage every one from the package: fix before merge / already resolved (cite the commit) / can stay deferred.
5. **Rulings.** For each controller or task-review ruling recorded in the plan, reviews or PRs, say whether you agree.
6. Do not touch the working tree, index or HEAD. Run no fix.

## Report

Write `{report_path}` with this structure (M11's "Report" section):

- One paragraph: range, how you reviewed, which probes you ran, what you did not read.
- `### Strengths`: specific, with file:line and the evidence (a measured result, a test name).
- `### Issues`, under `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)`. Each issue: an id (C1, I1, M1 …), a title naming the spec clause it breaks, files with line numbers, what happens, the measurement, why it matters, and a fix.
- `### Deferred minors — triage`, `### Rulings` (agreed / wrong, with reason), `### Declined to judge`, `### Recommendations`.
- `### Assessment`: "Ready to merge? Yes / With fixes / No" and the reasoning.

## Exit

Once the verdict is written, reply in under 10 lines: the assessment, findings by severity, the report and verdict paths.

Write your verdict to `{verdict_path}` matching `workflow/schemas/verdict.schema.json`, with `"node": "final-review"`, `"task": null`, the `sha` the package names, and one finding per issue in the report (same ids and severities); do not merge, push or edit code.
