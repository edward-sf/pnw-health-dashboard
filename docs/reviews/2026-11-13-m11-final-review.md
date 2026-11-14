# M11 explorer redesign — final whole-branch review

**Reviewed:** `8960663..544bbf2`, all eight M11 tasks after their task reviews · **Date:** 2026-11-13 · **Milestone PR:** #238

This is the reviewer's report as written, followed by what happened to each finding. It is the automated pre-merge review, not the author's milestone review (`docs/milestone-review-template.md`).

## Outcome

| Finding | Status | Where |
|---|---|---|
| C1. Map moves on a measure change or Show flip | Fixed. The title block has a fixed height; `stage.spec.ts` asserts one map box across measures, both Show states and an open county at 1440×900, 900×800 and 375×812. | #248 |
| I1. Phone map top past 330px on modelled outcomes | Fixed. The map starts 323px down for every measure and Show state. | #248 |
| I2. 24×24 targets not met; test measured geometry | Fixed with option (a), extended: short counties get invisible pads above the county layer (`web/src/map/placePads.ts`). The test samples `elementFromPoint` for all 149 counties on two pages. | #248, #251 |
| Minor 1. Desktop map view scrolls 40px | Fixed, with a test. | #248 |
| Minor 3. Measure filter kept after dismissal | Fixed, with a test. | #248 |
| Minor 4. `vaul` on a caret range | Pinned to 1.1.2. | #248 |
| Minor 5. Stale leftovers | `select` phone rule, unused `Toggle`, skip-link comment removed. `.county:focus-visible`, `modelMode` and `explorer--sheet-open` remain. | #248, #249 |
| Minors 2, 6, 7, 8, 9 | Deferred. | #249 |
| "Can stay deferred" triage list | Deferred. | #249 |
| Ruling: halo minimum 26 → 30 | Agreed it was wrong in effect; superseded by the pads. | #248 |
| 721–1099px panel coverage | Open question for the author. | #249 |

The fixes cost some layout, recorded in spec §14: a fixed description height (a one-line description leaves a blank line), a desktop map drawn 1102px wide instead of up to 1212px, and on phones the Show switch under the map with the outcome's name alone as the Compared heading.

The reviewer declined to judge `build-deploy` status. It was red at the time of this review (the keyboard walkthrough, from Task 8) and failed twice more after the fixes merged, each time on a different timing-sensitive e2e test. Those were fixed in #248, #250 and #251; `build-deploy` passes at `adb97b6`.

---

## Report

Range `8960663..544bbf2` (branch `236-a11y-pass`). Reviewed in passes from the review package, with current files read where a hunk was not enough. No whole suite was re-run. Three focused probes were run in headless Chromium against the dev server at head (scripts kept outside the repo); their numbers are quoted below. The working tree, index and HEAD were not touched.

Not read line by line: `package-lock.json`, the binary screenshot, the plan text, and the bodies of `Explorer.test.tsx`, `CountyPanel.test.tsx` and `smoke.spec.ts` (test names and the tests that bear on the findings were read).

### Strengths

- **URL state is one function.** `parseParams` returns a `canonical` query string and `useExplorerParams` applies it with `replace` (`web/src/explorer/useExplorerParams.ts:25-29`). Review Focus 1 and 2 hold in the running app: `?mode=model&t=injury_deaths&c=16069&view=table` loaded injury deaths, Compared with expected, table view, the county open, and the address bar became `?c=16069&view=table&i=injury_deaths&show=expected`.
- **The dismissable-layer story is sound.** With the panel open, Escape closed only the measure popover, then only the Outcome select, then only the theme menu, then only the county search list; the next Escape closed the panel. This held in the running app, and `Explorer.test.tsx:126,378,398` cover three of the five cases.
- **The vaul workaround is contained and explained.** `web/src/components/ui/drawer.tsx:9-33` nests a non-modal Radix root, says why, and `PanelShell.test.tsx` ("phone: the page behind stays reachable…") guards it.
- **Data colors cannot drift between themes.** Only `tierNone`, `hatchBackground` and `hatchLine` live in `Palette` (`web/src/color/palette.ts`), and `outlineContrast.test.ts:90` asserts the ramps and the four colored tiers are identical in every palette. `tokens.test.ts` ties `--stage` to the palette.
- **Selection never moves the map.** The panel is out of flow (`styles.css:737-749`) and `stage.spec.ts:21` asserts the box at three sizes.
- **Little was left behind.** Every class in `styles.css` is still referenced from `src`; `IndicatorPicker`, `OutcomePicker`, `native-select` and the `segment` button variant are gone; no native `<select>`, `aria-pressed` or `cn` package remains.
- Task 8 closed several earlier deferred minors with tests (see the triage).

### Issues

#### Critical (Must Fix)

**C1. The map moves and resizes when the measure changes or the Show switch is flipped (spec §1 anti-goal 1).**

- Files: `web/src/explorer/Explorer.tsx:74-85` (stage offset re-measured when the title block resizes), `web/src/styles.css:427` (`height: max(480px, calc(100dvh - var(--stage-top)))`), `web/src/explorer/Explorer.tsx:207-257` (title block of variable height above the stage), `web/e2e/stage.spec.ts:21` (stability is asserted for county selection only).
- What happens: the title block is taller for some measures (a description that wraps to two lines, the Show switch in the title row, the longer Compared-with-expected description). The stage starts lower, and from 721px it also gets shorter, so the map is redrawn smaller.
- Measured at head, over all 47 measure states (King County's top edge and width in CSS px):

  | Viewport | Most measures (37) | `pct_black`, `pct_aian`, `pct_nhpi`, `frequent_mental_distress` | Outcome, Observed | Outcome, Compared with expected |
  |---|---|---|---|---|
  | 1440×900 | top 422.6, width 61.87 | 439.4, 59.66 | 423.5, 61.78 | 440.3, 59.57 |
  | 1100×800 | 393.2, 52.46 | 409.9, 50.25 | 395.6, 52.17 | 412.4, 49.96 |
  | 900×800 | 440.1 | 451.3 | 442.7 | 454.4 (premature death: 486.8) |
  | 375×812 | 363.9 | 385.1 (four demographics) | 415.9 | 437.1 |

  So flipping Observed → Compared with expected at 1440×900 moves the map 17px down and shrinks it 3.6%. On a phone, going from poverty rate to life expectancy moves it 52px, and on to Compared with expected 73px.
- Why it matters: the spec lists this first among the anti-goals, which it defines as "failure even if everything works", and goal 1 says the map keeps the same size and position "whatever the reader does". The exit-criteria test passes because it only selects a county.
- Fix: make the title block's height independent of the measure from 721px (reserve two description lines and the switch's row height, or clamp the description), and on phones keep the Show switch out of the flow above the map or reserve its row. Then extend `stage.spec.ts` to assert the map's box across a measure change and a Show flip at the three sizes.

#### Important (Should Fix)

**I1. On phones the map's top is past 330px for the three modelled outcomes (spec §2, third bullet).**

- Files: `web/e2e/stage.spec.ts:94-99` (checks `?i=poverty_rate` only), `web/src/styles.css:1190-1238`.
- Measured at 375×812: stage top 312px for most measures, 333px where the title wraps, 364px for life expectancy, premature death and injury deaths, 385px in Compared with expected. The README's own screenshot state is one of the 385px ones.
- Fix: the same change as C1 on phones; then run the 330px assertion over an outcome in both Show states.

**I2. The 24×24 pointer-target criterion is not met, and its test cannot see that (spec §2, fifth bullet).**

- Files: `web/src/map/CountyMap.tsx:84-101` (the halo group is drawn before, so under, every county), `web/e2e/stage.spec.ts:102-130` (adds the halo's stroke to a bounding box and never asks what the pointer hits), `web/src/map/buildMapPaths.ts:30-41`.
- What happens: a halo only adds hit area where no county is painted over it. That works for islands and coasts. A small county surrounded by neighbours gains nothing, so the Task 3 ruling to raise the minimum from 26 to 30 changed the test's arithmetic and not the target.
- Measured with `document.elementFromPoint` at 1440×900 (0.5px grid): 19 counties have a reachable bounding box under 24px on a side. Clear cases: Wahkiakum WA 22×16, Multnomah OR 46.5×18.5, Madison ID 26.5×19, Fairbanks North Star AK 30.5×19, Hood River OR 20×28, Jerome ID 31.5×20.5, Payette ID 22.5×22, Gooding ID 22.5×33, Anchorage AK 24.5×12.5, Bristol Bay AK 35×17.5, Skagway AK 34×19.5. Eight more are within 1px of 24 (Benewah, Gem, Minidoka, Teton, Polk, Yamhill, Asotin, Juneau).
- Why it matters: the exit criterion says "every county". This is a large improvement on the 83 that fell short before, and search and the table remain equivalent routes, but the milestone currently records the criterion as met on the strength of a test that proves something weaker.
- Fix, one of: (a) draw the halos of counties that are still short above the county layer, smallest on top, as §7 allows ("more than necessary"); or (b) accept the residue, record it in §14, and change the test to measure reachable area with a named exception list. Either way the test should use `elementFromPoint`.

#### Minor (Nice to Have)

1. **The page always scrolls 40px in desktop map view.** `styles.css:427` ends the stage at the viewport's bottom edge and `main`'s `padding-bottom: 2.5rem` (`styles.css:228-231`) follows it: `scrollHeight` is 940 at 1440×900 in every state. A permanent scrollbar where scrollbars are always shown, and a wheel nudge moves the map. Subtract the padding in the height calc, or drop it for the explorer from 721px.
2. **Escape from outside the panel moves focus.** `Explorer.tsx:90-96` focuses the opener or the title whenever the panel closes. With focus in the search input (text typed, list closed), Escape closed the panel and moved focus to the page heading. Move focus only when it was inside the panel.
3. **MeasurePicker keeps its filter text after Escape or an outside click** (`MeasurePicker.tsx:64`; deferred from Task 3). Reopening shows the old text and possibly "No measures match". Clear it in `onOpenChange(false)`.
4. **`vaul` is on a caret range while `drawer.tsx` depends on 1.1.2's internals** (`package.json:39`). Pin the exact version; the unit test will catch a break, but only after an upgrade lands.
5. **Stale leftovers:** `select` in the phone min-height rule (`styles.css:1248`, no native select remains); `.county:focus-visible` (`styles.css:489`, county paths are not focusable); the unused `Toggle` component (`components/ui/toggle.tsx:24-39`, only `toggleVariants` is imported); the `modelMode` prop name (`CountyPanel.tsx:39`); `explorer--sheet-open`; the skip-link comment's "grid flow" (`styles.css:247`).
6. **"Last viewed this session" lasts only while the Explorer is mounted** (`MeasurePicker.tsx:29`). Visiting Methodology and returning forgets it. Spec §5 says "this session".
7. **No phone e2e selects a county from the search list by tap.** `mobile.spec.ts` covers the measure list, the drawer and the Outcome select; the search's `onMouseDown`/`onBlur` pairing (`CountySearch.tsx`) is only exercised with a mouse.
8. **`index.html`'s theme script duplicates `readChoice`/`resolveTheme`** with a comment as the only link. A unit test that evaluates the inline script against the same cases would keep them in step.
9. `?i=poverty_rate&t=life_expectancy` (the default outcome, spelled out) is left in the URL, though `setTarget` would remove it. Harmless.

### Deferred minors — triage

**Fix before the milestone merges to main**

- Task 3, MeasurePicker filter not cleared on dismissal — one line, user-visible (Minor 3).
- Task 3, `--stage-top` re-measurement — do not add more triggers; the re-measure is the mechanism behind C1, so settle it as part of that fix.
- Task 1, Aleutians halo test proves little — superseded by I2; replace the bounding-box test.
- Task 3, skip-link comment "grid flow" — fix in passing with Minor 5.

**Already resolved by Task 8 (close them)**

- Task 4: `aria-activedescendant` test (added, `CountySearch.test.tsx`); removed `onBlur` (restored in `4469da3`).
- Task 5: breakpoint remount loses focus (`ad9b4bb`, with unit tests; still no browser test).
- Task 6: phone header focus order (`260f50e`).

**Can stay deferred**

- Task 1: `Explorer.test.tsx:334` selector; `buildStateBorders` empty-lower-48 guard; state border over the selected outline (by construction the white ring still shows on both sides; worth one look by eye in each theme).
- Task 2: `parseParams` guard tangle; duplicated manifest extension in tests; TDD evidence.
- Task 3: 480px minimum on short viewports.
- Task 4: listbox inside a `role="dialog"` popover; missing component tests for arrow-reopen and the no-match popover.
- Task 5: ModelCard label equality; `--drawer-hidden` in dvh; "sheet" naming; hard-coded mouse coordinate.
- Task 6: token test gaps; StripPlot comment; `theme-color` meta (`color-scheme` is already set in CSS).
- Task 7: M6 §4.3 note; parent spec routes list; long line.
- Task 8: toggle-group arrow timing (ordering of same-delay timers is reliable, and unit and e2e tests cover it); ThemeMenu remount and the breakpoint in two places; `focusInside` staleness; `FocusRestorer` lookup; ThemeMenu proxy test; `.county:focus-visible` in the keyboard spec (the rule is dead, see Minor 5).

**Rulings**

- Task 3, halo minimum 26 → 30: wrong in effect. It satisfied the test without giving landlocked counties a larger target (I2).
- Task 3, phone stage at natural height; Task 1 inset; Task 5 424px gap; Task 5 drawer returns to 40%; Task 5 vaul workaround: agreed.
- Task 5, 721–1099px: agreed that it goes to the user. At about 800px wide the panel covers nearly all of Washington, Oregon and Idaho; the map stays clickable only in the strip left of it.
- The process rulings (no worktree, stacked branches, landing, models) were not reviewed.

### Declined to judge

- iOS Safari behaviour of the non-modal vaul drawer (vaul fixes `body` in place for 500ms on open in Safari; the suite runs Chromium only).
- Screen-reader announcement of the county search listbox inside Radix's `role="dialog"` popover, and of the non-modal panel dialog — axe passes; no screen reader was used.
- Whether the panel should narrow, dock or become the drawer at 721–1099px — the spec leaves it as an open question for the author.
- Visual quality of the dark palette, the legend's fit in the corner above Alaska, and the README screenshot — not compared against a design.
- cmdk's fuzzy matching in the measure filter versus a plain "contains" match — the controller already accepted it.
- Pressing Escape anywhere closing the panel at all — tested, intended behaviour; only the focus move is raised (Minor 2).
- `ci` and `build-deploy` status on `milestone/m11`, and the branch and PR process rulings — not code.
- Firefox and Safari timing of the toggle-group arrow selection — tested in Chromium and jsdom only.

### Recommendations

- Extend `stage.spec.ts` so the map's box is asserted across the three things the anti-goal names: panel open (done), measure change, Show flip. The legend case is safe by construction from 721px and on phones.
- Where an exit criterion is about what a pointer can reach, test with `elementFromPoint`, not geometry.
- Add a short "§14 As built" entry for whatever is decided on I2 and on the 721–1099px question.

### Assessment

**Ready to merge? With fixes.**

**Reasoning:** The URL model, layering, focus handling, theming and cleanup are solid and well tested, and three of the four anti-goals hold. The first anti-goal does not: the map shifts and rescales between measures and on the Show switch (C1), and two exit criteria (phone map top, 24px targets) pass only because their tests check a narrower case than the criterion states (I1, I2).
