# M13 branding — final whole-branch review

**Reviewed:** `33bdbc3..3cb77f1` (`milestone/m13`, all nine M13 tasks after their task reviews) · **Date:** 2026-11-15 · **Milestone PR:** M13 — Branding (milestone/m13 → main)

## Report

Range `33bdbc3b..3cb77f19`. I reviewed against the running app, not only the diff. I built `web/dist` at head and served it on port 4199. I also built the pre-M13 base (`33bdbc3`, from `git archive` into the scratchpad, sharing the same exported data) and served it on port 4198, so I could tell regressions from older faults. The probes were headless Chromium scripts kept outside the repo:

- **Header focus:** ring colour, geometry and the surface under it for every header stop, in both themes, at 1440×900 and 375×812, on `/` and `/about`.
- **Header layout:** element boxes at 15 widths from 320 to 1440 on three pages.
- **Legend:** geometry for all 44 measures plus the 3 Compared-with-expected states (47 states) at 10 viewports (1440×900, 1100×800, 1024×768, 900×800, 801×800, 768×1024, 721×800, 414×896, 375×812, 320×640).
- **Outcome flip:** the legend, panel, tooltip and table across Life expectancy → Premature death → Life expectancy → Injury deaths.
- **Shared links:** old and current links, and the Methodology and About anchor ids, compared with base.
- **Token pairs and separation:** contrast and ΔE76 for every brand token against every data colour.
- **Methodology `code` sizes.**

I also ran the full default e2e suite (`CI=1 npx playwright test`: 104 passed, 22 skipped), `vitest` (74 files, 687 tests), lint, typecheck, and the two pipeline test files. All were green. The working tree, index and HEAD were not touched.

**Not read line by line:** `package-lock.json`, the PNG assets beyond viewing them, the `.tasks.json`, the plan's per-step prose beyond Tasks 5–7, and the unchanged bodies of `smoke.spec.ts` and `Explorer.test.tsx`. I did not run the opt-in Firefox and mobile-safari projects.

### Strengths

- **The outcome flip is consistent everywhere (Review Focus 4).**
  - **Legend.** Life expectancy reads "Notably lower (1) … Notably higher (14)". Premature death reads "Notably higher (3) … Notably lower (7)". Switching back restores the Life expectancy labels exactly.
  - **Table.** Its tier counts match the legend for each outcome: LE `{lower 1, 4; about 109; higher 11, 14}`, PD `{higher 3, 5; about 113; lower 14, 7}`.
  - **Panel and tooltip.** Both re-render with the new outcome and leave no stale labels.
  - **Code.** `tierLabel(flag, direction)` (`web/src/model/modelView.ts:18-50`) is the only label source, and every caller passes its target's `direction`.
- **The social tags hold under the base path (Review Focus 3).**
  - **Built HTML.** `dist/index.html` has `og:url = https://edward-sf.github.io/pnw-health-dashboard/`, and `og:image` and `twitter:image` point to `…/pnw-health-dashboard/og-image.png`.
  - **Files.** All four referenced files are in `dist/`. `og-image.png` is 1200×630 and `apple-touch-icon.png` is 180×180.
  - **404 page.** `brand.test.tsx` checks that `404.html` carries the same tags.
- **Contrast holds across the board.**
  - **axe.** It is clean on both projects in both themes, across 11 page states.
  - **Untested pairs I computed.** `--focus` on `--fir-soft` is 9.74 (light) and 6.83 (dark). `--evergreen` on `--wash` is 5.33 and 6.60. `--alert` on `--wash` is 5.57 and 5.93.
  - **Header ring on the fir.** The mint ring on fir is 6.98:1 (light) and 10.47:1 (dark), and the theme button's ring settles to the same colour.
- **Brand and data colours stay apart.** In both themes every brand token is at least ΔE 15 from every data colour. The closest pairs are `--fir` light at 19.1 against the dark hatch, and the mint (`--focus-on-fir`) at 28.5 against Blues `#bdd7e7`. The sun (`#f2c46d`) is ΔE 10.9 from OrRd `#fdcc8a`, but it appears only in the mark, as the spec's call says.
- **Shared links still work.**
  - **Explorer links.** `?mode=model&t=premature_death&c=53033&view=table` canonicalises to the same state as on base. `?i=current_smoking&c=41051` and `?i=life_expectancy&show=expected&c=16001` open the same county.
  - **Anchors.** `/methodology#indicators-behaviors` and `#model` resolve. The sets of element ids on Methodology and About are identical to base.
- **The sensitivity table is enforced by tests.** `pipeline/tests/test_sensitivity_review.py` parses Appendix A and fails on any indicator, race group or target missing from it. A grep of non-test `web/src` finds no user-facing better or worse tier wording. The one remaining "better", in `AtAGlance.tsx:33` ("fits the national pattern better"), describes model fit, not a county. The T7 task review's I1 (the "better or worse" tier sentences) was fixed before merge.
- **Brand surfaces are tidy.**
  - **Name and assets.** `brand.ts` is the single source of the name and tagline, and the old name is gone (`brand.test.tsx`).
  - **Profile links.** They are `<a>` elements with names, `title` tooltips and 36×36 targets (`About.tsx:83-99`).
  - **Code type.** Methodology `code` stays 14px in 16px text, the same as base, so deferred T3 M3 has no visible effect.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**I1. The header nav focus ring falls partly off the fir and off the screen (spec §5.1 Focus, "3:1 against every surface it can sit on"; Review Focus 1).**

- **Files:**
  - `web/src/styles.css:247-263`: nav links are `align-self: stretch` with `min-height: 2.75rem`, so they fill the header's full height.
  - `web/src/styles.css:149-152,200-202`: a 2px outline at a 2px offset.
  - `web/e2e/brand.spec.ts:67-87`: the test asserts only the computed `outline-color`.
- **What happens:**
  - **Desktop.** The link box is the full 0–56px of the header, so the ring is drawn from y −4 to 60. Its top edge is above the viewport and never shows. Its bottom edge lies on `main`, below the header.
  - **Phone (375×812).** The ring runs from y 28 to 80, while the header ends at 76, so the bottom edge again lies on the page.
  - **Light theme.** That bottom edge is mint `#8fcfb3` on paper `#f2f5f1`, which is **1.63:1**. Only the two vertical sides sit on fir (6.98:1).
  - **Screenshot.** The light 1440 screenshot shows an open-topped box whose bottom line is barely visible.
  - **Dark theme.** Mint on dark paper is 10.04:1, but the top edge is still off-screen.
- **Measured:** this holds for Explorer, Methodology and About in both themes, at 1440 and at 375. The theme button (y 6–50 desktop) is unaffected.
- **Why it matters:** this is the Review Focus's own item. The spec's focus rule fails as measured, while the e2e passes, because it checks the token, not where the ring lands. That is the M11 pattern.
- **Fix:**
  1. Add `.site-header nav a:focus-visible { outline-offset: -2px; }` (or `-4px`), so the ring sits inside the link and fully on fir.
  2. Extend `brand.spec.ts` to assert that the outline's outer box lies within the header's box and the viewport.

**I2. The map legend still overlaps the Alaska frame for six measures at 721–1100px (spec §5.3: the legend stays "within the corner constraints #277 lists"; #277: "stay inside the corner above the Alaska frame").**

- **Files:**
  - `web/src/styles.css:547-583,691-719` (`.map-stage .legend`, `.legend-bins`, `.legend-range`).
  - `web/src/color/Legend.tsx`.
  - `web/e2e/stage.spec.ts:241-276`: the check runs only on `?i=poverty_rate` and the model legend.
- **What happens:** the per-100k ranges ("10,512.6 per 100k – 24,556.3 per 100k") wrap to four lines under the narrower swatches. The legend grows to 114–138px tall, and its last rows ("Suppressed or not available") run over the Alaska frame and its "Alaska (not to scale)" label.
- **Affected measures:** `premature_death`, `injury_deaths`, `primary_care_physicians`, `mental_health_providers`, `dentists` and `preventable_hospital_stays`.
- **Measured:**

  | Viewport | Legend bottom | AK frame top | Overlap |
  |---|---|---|---|
  | 900×800 | 470 | 445 | 25px |
  | 1024×768 | 408 | 387 | 21px |
  | 1100×800 | 408 | 387 | 21px |
  | 801×800 | 123px tall | | hits |
  | 721×800 | `premature_death` only | | hits |

  It is clear at 1440×900, 768×1024 and on phones. The other 41 measures are clear everywhere I measured.
- **Base comparison:** base had the same fault (900: legend bottom 463 vs frame top 434), so this is not a regression. It is a #277 constraint that T6 was meant to satisfy, and the milestone would close #277.
- **Why it matters:**
  - The legend covers Alaska counties on a measure family (per-100k rates) that the demo is likely to show.
  - The test generalises from one measure, as M11's "330px check on one measure" did.
- **Fix:**
  1. Shorten the range labels. For example, state the unit once (a "per 100k" caption, or format numbers without the unit inside the ramp), or format ranges compactly ("10.5k–24.6k").
  2. Then loop the stage e2e over every measure, or at least one measure per unit, at 900×800 and 1100×800.

#### Minor (Nice to Have)

**M1. At 320px the About link overlaps the theme button, and the test measures the wrong box (Review Focus 2: "nothing overlaps").**

- **Files:** `web/src/styles.css:1319-1323` (phone nav `flex: 1; min-width: 0`) and `web/e2e/brand.spec.ts:38-62`.
- **What happens:** at 320×640 on `/` and `/methodology`, the nav box is 8–232, but its links overflow it to 265.3. The About link (202.0–265.3) overlaps the Theme button (264.0–308.0) by 1.3px.
- **Why it is only minor:** the overlap is inside About's padding, so nothing is visibly clipped.
- **The test gap:** the test compares `.site-header-inner`'s children, so it sees the nav box (ending at 232) and passes.
- **Fix:** either let the nav not shrink below its content (`min-width: auto`) or reduce the link padding below 360px. Have the test compare the links' and the button's boxes.

**M2. Legend ranges collide at the narrowest widths (spec §5.3: "at every width, including … the phone layout"; deferred T6 M3).**

- **At 320×640:**
  - `total_population`: "41,049 –" and "98,902 –" run together, and ranges overlap.
  - `median_household_income` and `total_population`: the last range extends past the legend's right edge.
- **At 721×800:** `total_population`'s last range extends past the legend.
- **Elsewhere:** at 375 and 414 all 47 states are clean.
- **Fix:** the same compact range format as I2, plus one phone-width case in `stage.spec.ts`.

**M3. The raw-value guard does not cover all of `web/src` (exit criterion: "No component in … `web/src` uses a raw hex colour, an off-scale radius or an off-scale font size").**

- **What is not covered:** `SWEPT` (`web/src/test/tokenUsage.test.ts:6-16`) leaves out `src/theme`, `src/data`, `src/model` and `src/hooks`, which hold `ThemeMenu.tsx`, `ErrorPage.tsx` and `ModelLegend.tsx`. They are clean today, but nothing stops a regression.
- **Literal font sizes:** SVG `fontSize={11}` and `fontSize={10}` remain in `ShapBars.tsx:39,63` and `ResidualRange.tsx:93`. The as-built section records this.
- **Fix:** guard `src` as a whole (with the `src/color` and `BrandMark` exemptions), and either move the SVG sizes onto the scale or name the exemption in the exit criterion.

**M4. The separation and focus tests cover fewer tokens than the guide claims (exit criterion: "every new brand token"; deferred T2 M1).**

- **Separation.** `tokens.test.ts:85-91` checks `--fir`, `--evergreen` and `--fir-soft`, but not `--focus-on-fir` or the dark `--focus` (both the mint used in the mark). `docs/design-system.md:101` says "every brand colour".
- **Focus.** Focus on `--fir-soft` is not asserted.
- **Status.** Both pass today (28.5 ΔE; 9.74:1 and 6.83:1).
- **Fix:** add the two tokens to the separation loop, and `--fir-soft` and `--stage` to the focus loop.

**M5. The mark has one variant, and its colours borrow the focus token (spec §4 Mark: "Variants: on fir (header), on paper, and monochrome").**

- **Coupling.** `web/src/brand/BrandMark.tsx:10-11` fills the mountain with `var(--focus-on-fir)` and the snow with `var(--header-ink)`. Retuning the header focus colour would recolour the logo.
- **Variants.** Only the on-fir drawing exists. The guide (`docs/design-system.md:10`) documents just that one.
- **Fix:** give the mark its own colours (literals in the exempt file, or `--mint`), and add the paper and monochrome variants, or record the narrowing in §12.

**M6. `404.html` hard-codes the social origin (spec §5.3: the origin comes from "one build-time setting … so the hosting move later changes one value").**

- **Where:** `web/public/404.html:16-17,21` holds literal `https://edward-sf.github.io/…` URLs, because `public/` is not processed. As-built §12 records this.
- **Consequence:** the hosting move must edit two places.
- **Why the test won't catch it:** `brand.test.tsx` substitutes the default origin into `index.html` before comparing, so an origin set only through `VITE_SITE_ORIGIN` would leave a mismatch it cannot see.
- **Fix:** either a comment in `vite.config.ts` and the guide naming both places, or a test that builds with a non-default `VITE_SITE_ORIGIN` and compares `dist/404.html`.

**M7. Old vocabulary is left in a test fixture and a comment.**

- `web/src/panel/ResidualRange.test.tsx:91-92` still passes the retired note "Higher is worse … worse than expected" as the input string. It is harmless, but it reads as current copy.
- `web/src/table/sortModelRows.ts:11` says "worst to best" (deferred T7 M2).

### Deferred minors — triage

| Task · id | Item | Triage |
|---|---|---|
| T2 · M1 | Focus not tested on `--fir-soft` | **Can stay deferred.** It passes (9.74, 6.83); fold into M4. |
| T2 · M2 | Fir values off the starting values | **Already resolved.** Spec §12 "Token values (#321)" in `3cb77f1`. |
| T3 · M1 | Button props reformat | **Can stay deferred** (noise only). |
| T3 · M2 | e2e helper accepts the 2px wrapper border without checking its colour | **Can stay deferred.** `--focus` on `--wash` is token-tested ≥3. |
| T3 · M3 | Methodology `code` size fixed | **Already resolved in effect.** There is no `code` in headings, and all 14 are 14px in 16px text, as on base. |
| T4 · M1 | `similar-peer` and `table-county` stay native buttons | **Can stay deferred.** It is recorded in §12 (#323) and is defensible for in-text link buttons. |
| T4 · M2 | Sweep not visible in the diff | **Already resolved.** Recorded in §12 (#323). |
| T5 · M1 | Tagline hides below 720, not 480 | **Already resolved.** Recorded in §12 (#324). At 480–719 the brand row would be crowded, so I agree. |
| T5 · M2 | Favicon and theme-color literals | **Can stay deferred.** Fold the drift note into M6's comment. |
| T5 · M3 | Long ThemeMenu class string | **Can stay deferred.** |
| T6 · M1 | No ModelLegend ordered-list test | **Already resolved.** `ModelLegend.test.tsx` asserts tier order, counts and the flip (#325/#326). |
| T6 · M2 | Ascending-order test parses text | **Can stay deferred.** |
| T6 · M3 | Phone ramp untested | **Fix before merge with M2.** It is clean at 375 and 414 but collides at 320. |
| T7 · M1/M2 | e2e tier order differs from the Step 8 prose | **Already resolved.** Recorded in §12 (#326); the test matches Appendix A. |
| T7 · M2/M1 | Stale better/worse comments | **Can stay deferred.** Listed as M7; only `sortModelRows.ts:11` remains. |
| T8 · M1 | Firefox omits `mobile` | **Already resolved.** Stated in PR #329 and §12. |
| T8 · M2 | PR body lists what was checked | **Already resolved.** #329 lists the results and links #327 and #328 (both `type:bug`, `future`). |

### Rulings

- **Fir and fir-soft moved off the starting values to clear ΔE 15 (#321).** Agreed. The hue family is kept, and the measured minimum is 16.1.
- **Radius tokens as plain `:root` values, with Tailwind defaults matching.** Agreed.
- **`DATA_COLORS` lists only hex tier fills, not the hatch pattern.** Agreed. The hatch's component colours (`hatchBackground`, `hatchLine`) are listed.
- **Command filter focus as a 2px `--focus` bottom border on `--wash` (#322).** Agreed. It is the row treatment the spec asks for.
- **SVG `fontSize` attributes left alone (#323).** Agreed for now, but the exit criterion should say so (M3).
- **Tagline hidden below 720px (#324).** Agreed.
- **Phone header in two rows (#324).** Agreed, except for the 1.3px overlap (M1).
- **`404.html` with literal social URLs (#324).** Agreed it is forced by `public/`, but the one-setting goal is now two places (M6).
- **Model legend in compact rows inside the stage (#325).** Agreed. It clears Alaska at every probed size.
- **End labels anchored, not contained (#326).** Agreed. "More favorable" is wider than a swatch, and the labels sit exactly on the first and last bins (0.0px offset) in every probed state.
- **Flip e2e asserts TIERS order (#326).** Agreed. It matches Appendix A; the plan's prose was wrong.
- **T7 task review r1, I1 (better/worse tier sentences).** Agreed it was important; it was fixed before merge.
- **Firefox and mobile-safari opt-in; failures filed as test or emulation issues (#329).** Agreed for the project setup. See "Declined to judge" for the drawer.

### Declined to judge

- **Whether the iOS Safari drawer failures (#327) are real.** #327 itself says it is unknown whether they are an iOS bug or a WebKit emulation limit. I did not run WebKit. Given the demo goal, check on a device or in the simulator before the portfolio link goes live.
- **The "outdoors or tourism brand" anti-goal.** This is taste. The header and preview image read as restrained, and the mountain-and-sun mark is the spec's own choice. The preview's text is not set in Figtree, which is a small inconsistency the author may want to redo.
- **The three catalog descriptions in the running app.** The local `web/public/data` predates T7, so the app shows the old text. `build-deploy` runs the pipeline, and `test_indicators.py` pins the YAML, but I did not see the new descriptions rendered.

### Recommendations

1. Fix I1 (a one-line CSS change and a geometry assertion) and I2 (compact legend ranges, plus an every-measure stage check) in one fix PR. M1 and M2 fall out of the same edits.
2. Fill in the milestone PR body. It is still the template: the `Closes` lines are empty, so #272, #274, #277, #278 and #296 will not close on merge. Hold `Closes #277` until I2 is fixed.
3. Widen the guards (M3, M4) in the same PR. They are test-only.

### Assessment

**Ready to merge? With fixes.**

No anti-goal is broken outright:

- contrast holds on every text and control pair, and axe is clean;
- brand and data colours are at least ΔE 15 apart;
- shared links and anchors work;
- tier wording and colour now describe the model, not the county.

Review Focus items 3, 4 and 5 hold in the running app. Item 5 holds for the one four-bin measure (`pct_nhpi`); no directional measure has fewer bins, and the two-bin case is unit-tested.

Two spec clauses fail as measured, and in both cases their tests pass because they check a narrower case:

- the header focus ring lands half off the fir and off-screen (I1, Review Focus 1);
- the legend still covers Alaska for six per-100k measures at mid widths (I2, #277).

Both are small, contained fixes.
