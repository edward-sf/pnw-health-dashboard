# M12 replay and M11 baseline

Two results that gate and measure the M13 pilot of the agent workflow: a replay of M11's final review with the new `final-review` prompt and package, and the M11 cost baseline.

## Replay method

- Prompt: a blind copy of `workflow/prompts/final-review.md` with the two M11-specific references removed (the pointer to the M11 review file, and the parenthetical naming M11's misses). Saved as `.superpowers/sdd/2026-11-14-m12-workflow-engineering/final-review-blind.md`.
- Worktree detached at `544bbf2`, before the M11 review existed.
- Package: `wf package final --range 8960663..544bbf2`, against the M11 plan and spec, with an empty throwaway run state.
- Model: opus. The reviewer was barred from history after `544bbf2` and from `docs/reviews`.
- Full replay report: `.superpowers/sdd/2026-11-14-m12-workflow-engineering/replay-m11-report.md`. The verdict validates with `wf.verdict.load_verdict` (C1 critical, I1-I3 important, M1-M4 minor, sha `544bbf2`).

## Replay scoring

Original findings are from the "Outcome" table of `docs/reviews/2026-11-13-m11-final-review.md`.

| Original M11 finding | Replay finding | Result |
|---|---|---|
| C1: map moves or resizes across measures and Show states | C1: at 1440x900 the map top moved 242.8 to 267.2px and width 1212 to 1167px | Matched |
| I1: phone map top position past 330px on modelled outcomes | Inside replay C1: at 375x812 the top was 369-390px | Matched |
| I2: 24x24 targets not met; the test measured geometry | I1: 15-20 counties under 24x24 (for example Wahkiakum 23x16), halos under neighbours, test measured bounding boxes | Matched |

Also matched beyond the three scored findings: the 721-1099px panel-coverage question (replay I3), the vaul caret range (M3) and stale leftovers (M4).

New in the replay, not in the original: legend and Alaska label overlap at 900x800 and 721px (I2), Alaska label size on phones (M1), state-border contrast against counties (M2).

**Result: PASS.** All three scored findings were found. The pilot may start.

## M11 baseline

Produced by `wf baseline --milestone 11 --since 2026-11-13T16:00:00Z --until 2026-11-14T09:00:00Z --branch milestone/m11 --tasks 8 --fix-prs 248,250,251` (output in `.superpowers/sdd/2026-11-14-m12-workflow-engineering/m11-baseline.json`).

| Measure | M11 |
|---|---|
| Fix PRs after the final review | 3 (248, 250, 251) |
| Red `build-deploy` runs after a merge | 3 (bb9310c, d45f69e, 0cbd3e1) of 15 runs on `milestone/m11` |
| Tokens (input + output + cache creation, once per message, session and 21 subagents) | 6,892,401 |
| Tokens per task (8 tasks) | 861,550 (about 0.86M) |
| Cache reads, not counted above | 171,892,946 |

The only session in the window is `d876724f-189a-488f-ac71-be03472ecc70` ("Milestone 11 - UI/UX Overhaul"), first message 2026-11-13T16:22:29Z.

## Caveats

- Window correction: the planned `--since 2026-11-13T17:00:00Z` matched no session, because the M11 session began at 16:22Z. The baseline uses `--since 2026-11-13T16:00:00Z`. The M10 session (`d0b4756d…`, 2026-11-13T00:05Z) is outside it.
- The baseline is untrimmed. The session file runs to 2026-11-14T18:59Z, and 188,033 of the tokens are from messages after 09:00Z on 14 November. That is M11's own post-review fix work and belongs in the M11 cost. Trimmed alternative, computed the same way (last line per message id): 6,704,368 tokens, 838,046 per task.
- Transcripts write one line per content block, each repeating the message's usage. `wf baseline` keeps the last line per `message.id` within each file (lines with no id count once each). Summing every line instead inflates the totals by about 1.9x. M13 must be measured with the same `wf baseline` method, or the comparison is invalid.
- Cache reads are reported separately, not summed. Subagent tokens come from `subagents/*.jsonl` transcripts.
- Red deploys are counted as `failure` conclusions on or after the first run on the branch. Cancelled runs are not counted.
- Replay package caveat: its build-deploy history includes runs after `544bbf2` on `milestone/m11`. The three failed runs are not ancestors of `544bbf2`, and the reviewer did not judge them.
- Replay cost: 205,365 subagent tokens, taken from the task notification. That counter may not be computed the same way as the transcript sums above, so any comparison is indicative only. The original M11 final review's own tokens were not isolated in the baseline, so no like-for-like comparison exists.

## Pilot targets for M13

| Measure | M11 | M13 target |
|---|---|---|
| Fix PRs after the final review | 3 | at most 1 |
| Red `build-deploy` runs after a merge | 3 | 0 |
| Tokens per task | 0.86M | at most 0.60M (30% below M11) |
