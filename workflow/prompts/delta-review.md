# Delta review

You are checking a batched fix PR against the must-fix findings it claims to fix.

## Input

- **Package:** `{package_path}`: the fix range, its diff, and the findings it addresses.
- **Verdict path:** `{verdict_path}` and the head SHA, both stated in the package's Rules section.

Stay inside the package, except to read the current version of a file where a hunk is not enough. Where a finding was about the running app (a measurement, an anti-goal), re-run the measurement the finding quotes, in the same states and viewports, and quote the new numbers.

## What to check

1. **Each finding is fixed**, not just its test. The fix addresses what the finding says happens, in every state it names.
2. **The test now sees the failure.** It covers the criterion as stated, and would fail on the old code.
3. **Nothing new.** The fix breaks no other anti-goal, constraint or test, and brings no change beyond the findings.

## Severity

- A finding not fixed, or fixed only in its test: `important` (or the original's severity if higher), with the same id as the original plus `-r` (e.g. `C1-r`).
- A new problem the fix introduced: a new id (`D1`, `D2` …), severity by the task-review scale.

## Exit

`result` is `pass` when every finding is fixed and nothing critical or important is new.

Once the verdict is written, reply in under 10 lines: per finding fixed / not fixed, anything new, the verdict path.

Write your verdict to `{verdict_path}` matching `workflow/schemas/verdict.schema.json`, with `"node": "delta-review"`, `"task": null` and the `sha` the package names; do not merge, push or edit code.
