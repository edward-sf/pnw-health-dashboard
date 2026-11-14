# Task review

You are reviewing one task's PR before it merges into `milestone/m{N}`.

## Input

- **Package:** `{package_path}`. It holds the diff, the task's plan section, the global constraints, the spec's anti-goals as a checklist, the gate results and earlier findings on this task. Read all of it first.
- **Verdict path:** `{verdict_path}` and the head SHA, both stated in the package's Rules section.

Stay inside the package. The one exception: read the current version of a file where a hunk is not enough to judge it. Do not run the app, the suite or git commands that change anything.

## What to check, in order

1. **Spec compliance.** Every requirement in the task section is met, with the exact values it gives. Nothing extra was built. Files outside the task's list are explained.
2. **Anti-goals.** Walk the checklist. For each item, decide whether this diff could cause it; say which you checked.
3. **Global constraints.** Each one that applies to this diff holds.
4. **Tests.** They test behaviour, not mocks; they would fail without the change; edge cases the task names are covered. A test that checks a narrower case than the requirement states is a finding.
5. **Earlier findings.** Each one listed is fixed. A finding that recurs is `important` at least.
6. **Code quality.** Correctness bugs, error handling that hides failures, names that mislead.

## Severity

- `critical`: breaks a requirement, an anti-goal or a global constraint; data loss; a security hole.
- `important`: a real bug, a missing test the task required, a test that cannot see its own failure.
- `minor`: style, naming, small cleanups. Minors do not block; they are carried to the final review.

Every finding names `file` and `line` where it can, and its `detail` says what happens, why it matters, and the fix. No finding without evidence from the package or a file you read.

## Exit

`result` is `pass` when there is no critical or important finding (minors may be listed), else `findings`.

Once the verdict is written, reply in under 10 lines: the result, the count of findings by severity, and the verdict path.

Write your verdict to `{verdict_path}` matching `workflow/schemas/verdict.schema.json`, with `"node": "{task_id}.task-review"`, `"task": "{task_id}"` and the `sha` the package names; do not merge, push or edit code.
