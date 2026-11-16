# M14 Methodology and About redesign — final whole-branch review

**Reviewed:** `2372eb3..7d9f3bc` (`milestone/m14`), all seven M14 tasks after their task reviews · **Date:** 2026-11-16

## Report

Range `2372eb3c..7d9f3bc4` (PRs #348, #350–#356). I read the review package, the spec, the plan, every PR body and the current source of `Methodology.tsx`, `useScrollSpy.ts`, `useHashFocus.ts`, `ReadingRail.tsx`, `PipelineHero.tsx`, `pipelineFigures.ts`, `R2Comparison.tsx`, `FactorBars.tsx`, `Fold.tsx`, `SectionLayout.tsx`, `MethodologyStep.tsx`, `steps.ts`, `ModelSection.tsx`, the methodology and About CSS (`styles.css:1560-2000`), `e2e/methodology.spec.ts` and the relevant parts of `a11y.spec.ts` and `Methodology.test.tsx`. I made production builds of head and of the pre-M14 base (`git archive 2372eb3`), both into the scratchpad with the same local data files, and served them with `vite preview`. Then I ran headless Chromium probes against them. The scripts are outside the repo. The probes were:
- **(a)** Full-text diff of the old and new Methodology pages, with every `<details>` open, for each of the three outcomes.
- **(b)** Layout geometry at 375, 600, 720, 721, 800, 900, 1000, 1100, 1280, 1440 and 1920 px: page overflow, split-column widths and R² and factor bar widths.
- **(c)** Every anchor (18 ids), deep-linked at 1440×900 and 375×812, with and without `prefers-reduced-motion`: position, focus, closed ancestors and rail state.
- **(d)** Every rail item, clicked at 1440×900, 1440×1600 and 375×812 in both motion modes: rail state at the click and after the scroll settles, per-frame `scrollY`, focus and popover.
- **(e)** Hero-strip clicks from a fresh load, followed by small wheel scrolls.
- **(f)** Phone bar position and Escape focus.
- **(g)** Screenshots in the light and dark themes.

`npx vitest run` passes: 83 files and 742 tests. I did not re-run Playwright, since CI and `build-deploy` are green at every merge. I did not read line by line `About.test.tsx`, `ModelSection.test.tsx`, the section tests changed only by reformatting, the binary screenshots or the roadmap diff. The working tree, index and HEAD were not touched.

### Strengths

- **The honest number is the hero's number.** `pipelineFigures.ts:20` reads the default target's LightGBM PNW R². The running app shows "0.41 R² in the region", against 0.64 nationally. `PipelineHero.test.tsx:63` pins the case where PNW R² is greater than or equal to national. `R2Comparison.tsx:30` uses a strict `<`, and `R2Comparison.test.tsx` covers both 0.6 > 0.5 and 0.5 = 0.5 (Review Focus 2 holds).
- **No depth was lost.** Probe (a): of 223 distinct text lines on the old page, the only ones absent from the new page are the retired "Methodology" and "At a glance" headings and At a glance's summary sentences. Every fact in those sentences is still on the page: the R² pair, the top three factors (FactorBars plus "Show all 9 factors"), the three outcome names, the source datasets and the associations wording. The one exception is the list of states (M7). The same holds with the picker on premature death and on injury deaths. The open page carries 23,982 characters against 16,610 closed, and `window.find` reaches folded text.
- **No anchor is broken.** All 18 ids exist, including the old ones. Every deep link, in both motion modes and at both sizes, ends with the target focused and no closed `<details>` above it (probe c). No anchored id sits inside a fold, so the spec's "never fold an anchored heading" rule holds (`Fold` wraps only lists and tables). The ancestor-opening loop in `useHashFocus.ts:25-27` is correct, and `useHashFocus.test.tsx` covers it.
- **No template chrome or marketing voice.** No element under `main` has `text-transform: uppercase` or a running animation on either page. The hero and About copy are plain statements. The About proof points match the repo: the `ci.yml` e2e job runs on `pull_request` and repeats changed specs at `E2E_CPU_THROTTLE=4` (`ci.yml:93-102`), state-grouped folds and Ridge are in `cv.py:17,40-56`, four sources are in the manifest (`acs`, `places`, `chr`, `boundaries`), and every chip is a dependency.
- **The page is shorter.** At 1440 wide the Methodology page is 10,824px tall, against 12,568px before, a 14% cut, mostly from folds.
- **The rail's last item is reachable** (Review Focus 3). Clicking "Reproduce it" leaves it current after the scroll settles, at 1440×900, 1440×1600 and 375×812 in both motion modes, because the end sentinel takes over (`useScrollSpy.ts:73-78`).
- **Reduced motion is honoured** (Review Focus 5). With `reducedMotion: "reduce"`, every rail and hero jump completes in one frame (probe d: `scrollY` goes 0 → target, two distinct values).
- **Little was left behind.** `AtAGlance`, `.at-a-glance`, `.methodology-toc` and `.about-profiles` are gone. No new CSS class is unreferenced. The hero `h2` renders in the loading and error states (`Methodology.tsx:45-47`).

### Issues

#### Critical (Must Fix)

**C1. The Model section's grid blows out: no R² bars at any desktop width, and the page scrolls sideways on phones and from 721 to 1099px (spec §1.3 "Model step", "Section layout"; Goal 3).**

- **Files:**
  - `web/src/styles.css:1657-1680`: `.methodology-prose` has no `min-width: 0`, and the split uses `1fr 1fr`.
  - `web/src/pages/methodology/ModelSection.tsx:67-244`: the whole section, `MetricsTable` (134-148) and every `h5` subsection included, is the `prose` slot.
- **What happens:**
  - The six-column accuracy table has a min-content width of 578px.
  - Because it sits in the prose grid item, that item cannot shrink below 580px.
  - On desktop the evidence column gets what is left: 204px at 1100 and above, 34–140px from 721 to 1000.
  - The R² row's fixed `8.5rem 1fr 3.5rem` columns leave its track 0px wide, so neither bar is drawn. The "0.64" and "0.41" overflow the box's right edge (screenshot at 1440).
  - In one column (below 721) the 580px column overflows the phone viewport. The text of the whole Model section is clipped at the right edge, and the page scrolls horizontally.
  - The evidence box also stretches to the full 3,266px height of the section, so it is a tall, mostly empty surface.
- **Measured (probe b):**

  | Width | `scrollWidth − clientWidth` | Model prose / evidence width | `.r2-track` width |
  |---|---|---|---|
  | 375 | **225** | 580 / 580 | 338 |
  | 600 | 0 | 580 / 580 | 338 |
  | 720 | 0 | 666 / 680 | 438 |
  | 721 | **344** | 580 / 34 | **0** |
  | 900 | **165** | 580 / 40 | **0** |
  | 1000 | **65** | 580 / 140 | **0** |
  | 1100, 1280, 1440, 1920 | 0 | 580 / 204 | **0** |

  The other split sections (`sources`, `exclusions`, `model-card`) split evenly, 392/392 at 1440.
- **Why it matters:**
  - The R² comparison is the milestone's one new chart, and the evidence the "Hiding the honest numbers" anti-goal points at. It renders as two bare labels.
  - Every phone reader of the Methodology page gets a sideways-scrolling page with clipped text.
  - jsdom has no layout, so no unit test can see this. No e2e test checks geometry: axe runs at phone width and passes.
- **Fix:**
  - **CSS:**
    - Give `.methodology-prose` `min-width: 0` (or use `grid-template-columns: repeat(2, minmax(0, 1fr))`).
    - Give `.methodology-evidence` `align-self: start`.
  - **Model section:** follow the spec and render `MetricsTable` "below the two-column block or folded". Render the `h5` subsections below the split as well, so that the left column holds the heading and one or two paragraphs.
  - **E2E:** add a test that loads `/methodology` at 375, 721, 1100 and 1440 and asserts `scrollWidth <= clientWidth`, and that each `.r2-bar` with a positive R² has a non-zero width.

**C2. The rail loses its place after every rail click, hero-strip click or in-page jump (spec §1.2 "Scrollspy", Settled 5 and 6; Goal 2 "a reader can always see where they are").**

- **Files:**
  - `web/src/pages/methodology/useScrollSpy.ts:43-67`: the root margin sums to the full viewport height, so the observed line is 0px tall. `passed` changes only when an entry is delivered.
  - `useScrollSpy.ts:86-96`: the pin is released on the first `scrollend`.
  - `web/e2e/methodology.spec.ts:7-17` and `30-37`: the tests work around the problem.
- **What happens:**
  - IntersectionObserver reports only threshold changes. A heading that crosses a zero-height line between two frames never intersects it, so the hook never learns that the heading has passed.
  - Every rail click and hero click is such a jump. With reduced motion the jump is instant, and without it `focus()` makes it instant (I1).
  - The pin shows the right item for one frame. The jump's `scrollend` then releases it, and the rail falls back to the stale set: usually nothing at all, sometimes an earlier section.
  - Small wheel scrolls afterwards do not repair it, because only a heading that crosses the line is added.
- **Measured (probes d and e):**
  - **1440×900, fresh load, with or without reduced motion:**
    - Rail clicks: "How it works" → current at the click, **null** once settled, **null** after a 120px wheel down, **null** after 240px up. "Similar counties" behaves the same.
    - Hero clicks: "Model" → **null** throughout.
  - **1440×900, clicking each of the 9 rail items in turn:** 8 of 9 settle to **null**. Only "Reproduce it" survives, through the end sentinel.
  - **1440×1600:** 7 of 9 settle on **"Sources and vintages"** (no reduced motion).
  - **375×812:** after picking "How it works", "What it leaves out" or "Similar counties", the phone bar settles on **"Fetch · Sources and vintages"**. The other picks settle on "On this page".
- **Why it matters:**
  - The rail is the page's navigation and its "you are here". A reader who uses it watches the highlight blink and vanish, and the phone bar names the wrong section.
  - The as-built note (spec line 216) says "rail clicks (which pin the item) and deep links are unaffected". Both halves are false, as measured.
  - The e2e tests pass only because they avoid the case:
    - `readDownTo` wheels 20px at a time, and its comment documents the bug.
    - The last-item test asserts `aria-current` straight after the click, while the pin still holds.
- **Fix:**
  - Stop accumulating crossings. In each observer callback, and when the pin releases, recompute `current` from `getBoundingClientRect().top` of the nine section headings (nine reads).
  - Observe a band that runs from the viewport top to the reading line, not a zero-height line, so a heading that lands at the top after a jump fires an entry.
  - **Test:** click each rail item at 1440×900, wait for `scrollend`, and assert `aria-current` on that item (or on the last item, where the page bottoms out). Do the same for one hero link and one phone pick. Drop the small-step workaround.

#### Important (Should Fix)

**I1. Smooth scrolling never happens for an off-screen target, and the heading lands mid-screen (spec §1.2: "Scrolling is smooth unless `prefers-reduced-motion` is set"; Review Focus 5's counterpart).**

- **Files:** `web/src/pages/methodology/useHashFocus.ts:28-29`.
- **What happens:**
  - `scrollIntoView({ behavior: "smooth" })` starts an animation. `el.focus()` runs immediately after, finds the element off-screen, and scrolls it into view at once, centred, which cancels the animation.
  - A smooth scroll survives only when the target is already on screen.
- **Measured (probe d, no reduced motion):**
  - **1440×900:** the jump to "Indicators" goes 0 → 934 in two frames. Every off-screen target ends with its heading at top ≈ 438 of 900, against 0 with reduced motion.
  - **1440×1600:** headings settle at top 788.
  - **375×812:** headings settle at top 395.
  - Deep links behave the same. In probe c, every no-preference deep link leaves the rail on the **previous** section: `#model` marks "Outcomes by race and ethnicity", `#similar-counties` marks "What it leaves out", and on a phone `#model-card` marks "Model · Similar counties". The heading sits below the reading line.
- **Why it matters:**
  - Most readers get an instant jump that parks the heading mid-screen, not the smooth scroll the spec and PR #354 describe.
  - The mid-screen landing also makes the rail disagree with the URL on every inbound link from the Explorer panel.
- **Fix:**
  - Use `el.focus({ preventScroll: true })`.
  - **Test:** with no reduced motion, assert that `scrollY` takes several distinct values after a rail click, and that the heading's top ends near 0.
  - Fixing this without C2 would make C2 more visible, because smooth frames also skip the zero-height line. Fix them together.

**I2. The phone bar and the rail stick below a header that isn't sticky (spec §1.2 "sticky under the header").**

- **Files:** `web/src/styles.css:1836-1843` (`.reading-rail--phone { top: var(--header-height) }`), `1878-1881` (`top: calc(var(--header-height) + 1rem)`) and `docs/design-system.md:102`.
- **What happens:**
  - `.site-header` is `position: static`, so it scrolls away. The phone bar then sticks 56px below the top of the screen, and page content scrolls visibly through the 56px gap above it.
  - Probe f: at 375×812, scrolled to 3000, the header bottom is at −2924, the bar top at 56, and `elementFromPoint(180, 30)` is a methodology `<details>`. The phone screenshot shows a bullet list above the bar.
  - The desktop rail floats 72px down for the same reason. That is cosmetic.
- **Why it matters:** this is visible on every phone scroll of the page, and it looks broken.
- **Fix:**
  - Set the phone bar's `top` to `0` and the rail's to `1rem`.
  - Then add `scroll-margin-top` to the methodology headings on phones, equal to the bar height (2.75rem plus its border), so a jump does not land a heading under the bar. This takes up deferred minor T5-M2 with the right premise.
  - Fix the design-guide entry to match.

#### Minor (Nice to Have)

**M1. The pipeline strip shows list bullets beside its cards (spec §1.1: steps "joined by small chevrons").**
- **Files:** `web/src/styles.css:1693-1696` (`.methodology ul { list-style: disc }`, specificity 0,1,1) overrides `.pipeline-strip { list-style: none }` (`1718`, 0,1,0).
- **Measured:** every `.pipeline-strip li` computes `list-style-type: disc` at 375 and 1440.
- **Why it matters:** this is the hero, and the README screenshot shows it.
- **Fix:** select `.methodology .pipeline-strip`, as the `li` rule already does.
- The as-built note (spec line 215) says it was "logged as a follow-up", but no issue exists.

**M2. The opening prose was not tightened (spec §1.3 "Copy").**
- **Files:** `ModelSection.tsx:70-133` and the other `*Section.tsx` prose slots.
- Probe (a) found every pre-M14 paragraph still on the page word for word. PR #352 nonetheless says the paragraphs "are tightened, not moved".
- No fact is lost, so this is presentation only. It is the reason the Model column is 3,266px tall.
- **Fix:** do it with C1, or record it in the as-built notes and correct #352's description.

**M3. The phone list is a hand-built popover, with focus and ARIA gaps (spec §1.2 "in the existing Popover or Drawer component").**
- **Files:** `web/src/pages/methodology/ReadingRail.tsx:49-88`.
- With focus on a list link, Escape unmounts the list, and focus falls to `<body>` (probe f). `aria-controls` names an element that doesn't exist while the list is closed (T5-M3).
- **Fix:** use the site's Popover, which handles both. Otherwise, return focus to the toggle on Escape and set `aria-controls` only while the list is open.

**M4. Several tests are narrower than the criteria they stand for.**
- `methodology.spec.ts:7-17,30-37`: see C2.
- `smoke.spec.ts`: "`#no-result` lands with the enclosing fold open" can't fail, because no anchored id sits inside a fold.
- No test measures geometry (C1) or smooth scrolling (I1).
- `Methodology.test.tsx:66` still exempts `model-importance` from the `tabindex` check, although it has had `tabIndex={-1}` since #356.
- **Fix:** add the tests named under C1, C2 and I1, and drop the stale exemption.

**M5. The About buttons' text is underlined.**
- **Files:** `web/src/pages/About.tsx:76` and the LinkedIn link next to it.
- The global `a { text-decoration: underline }` (`styles.css:163-168`) reaches the `buttonVariants` anchors. Before M14 they were icon-only.
- **Fix:** add `no-underline` to the button variant, or a `.about a[class*=…]` override.

**M6. The docs say things that aren't so.**
- Spec as-built line 216 claims that rail clicks and deep links are unaffected, and lines 215 and 216 both say "logged as a follow-up", but no issue exists for either.
- `design-system.md:102` says "sticky bar under the header".
- `design-system.md:105` gives the Fold's tokens as `--line` and `--ink-muted`, but `styles.css` styles the summary with `--evergreen`.
- **Fix:** correct these with the fixes, and file the follow-ups that remain.

**M7. The Methodology content no longer names the four states.**
- At a glance said "149 counties in Alaska, Idaho, Oregon and Washington". Probe (a) finds no state name in `<main>` now.
- The site header tagline ("County health across Washington, Oregon, Idaho and Alaska.") is visible at 375, 721 and 1440, so Ctrl-F still finds the fact, and the "Losing depth" anti-goal holds. Still, the page that defines "Pacific Northwest" no longer does. This confirms T4-M2.
- **Fix:** name the states in the Harmonization prose.

**M8. The evidence boxes are nested.**
- The Sources and Exclusions tables keep `.methodology-table-wrap`'s own border, surface and radius inside the `.methodology-evidence` box: two boxes, one inside the other (screenshot at 1440).
- **Fix:** drop the wrap's border and background inside `.methodology-evidence`.

### Deferred minors — triage

| From | Item | Triage |
|---|---|---|
| T1-M1 | Select import reformat | Can stay deferred. |
| T1-M2 | Redundant fragment, `ReproducibilitySection.tsx:32-37` | Still there. Can stay deferred (trivial). |
| T1-M3 | Anchor test skips `tabindex` for `model-importance` | Fix before merge, with M4. The exemption is now stale. |
| T2-M1 | "Including" test covers one category | Can stay deferred. |
| T2-M2 | Heading-above-fold order not asserted | Can stay deferred. Verified in the app: `#model-importance` precedes the fold. |
| T2-M3, T3-M1 (both rounds) | Prettier churn | Can stay deferred. PR #350 records the width-100 reformat. |
| T3-M2 | Prose not tightened | Escalated to M2, since the spec asks for it and the PR claims it. |
| T3-M3 | FactorBars zero case untested | Can stay deferred. |
| T4-M1 | Error state doesn't assert the `h2` | Can stay deferred. `Methodology.tsx:45` renders it outside the status check, and `App.test.tsx` covers it. |
| T4-M2 | State list may be gone | Confirmed. Now M7. |
| T5-M1 | Pin released by input; a no-scroll pin freezes the spy | Fix before merge, as part of C2: recomputing on release removes the freeze. |
| T5-M2 | No scroll margin under the sticky header | Fix before merge, with I2. The premise was wrong (the header isn't sticky), but once the phone bar sits at `top: 0`, headings need a margin for the bar. |
| T5-M3 | `aria-controls` dangling | Folded into M3. |
| T6-M1 | `a11y.spec.ts` outside the file list | Nothing to do. Recorded in #355. |
| T7-M1 | Phone axe run doesn't wait for data | Already resolved by construction. The "On this page" nav renders only in the ready branch, in the same commit as every section (`Methodology.tsx:50-54`). |
| T7-M2 | Inline `import()` type, `methodology.spec.ts:4` | Can stay deferred. |
| T7-M3 | `ModelSection.tsx` outside the file list | Nothing to do. Recorded in #356 and in the as-built notes. |

### Rulings

- **Plan: rename the `model` section heading to "How it works".** Agreed. Spec §1.3 calls the section that, and under the "Model" step heading it reads as a full phrase. The id is unchanged.
- **#350: `.methodology` max-width from 46rem to 64rem.** Agreed. The split needs the room.
- **#350, #352: Prettier at width 100.** Agreed, but it hid the real T3 change from review (three task-review minors). Future tasks should reformat in a separate commit.
- **#351: fold summaries "Show the reason" and "Show all N reasons", and "Including A, B and C."** Agreed.
- **#352: the page-level causal-language guard strips "Associations, not causes."** Agreed. The sentence is mandated and anti-causal, and the guard still covers everything else.
- **#352: "tightened, not moved".** Wrong as a statement of fact (M2).
- **#354: plain `<a>` rail links calling `onPick`, and a `smooth` flag in `useHashFocus`.** I agree with the design, but the flag has no effect for off-screen targets (I1).
- **#355: tests written alongside the implementation.** A TDD deviation. Accepted, since the tests are specific.
- **#356: `tabIndex={-1}` on `#model-importance`.** Agreed. The spec's deep-link rule needs it.
- **#356 and the spec's as-built: the zero-height line, with the e2e test wheeling in small steps.** Wrong. This is C2, and the test was bent to fit the defect.
- **#356: strip bullets "left as shipped, logged as a follow-up".** Wrong. Nothing was logged, and the fix is one selector (M1).
- **T5 task review: M2's premise that headings land under a sticky header.** Wrong premise (the header is static). The real defect is I2.
- **T4 task review: the state list asked for a Ctrl-F check in the final review.** Right to raise. Confirmed as M7.
- **Spec "Settled" 2 (the hero R² fixed to the default outcome).** Agreed. It is the honest regional figure and doesn't move with the picker.
- **The phone list as a custom popover rather than the site's Popover or Drawer.** Disagree, mildly (M3). The spec gave a choice between two existing components.

### Declined to judge

- **Whether the About copy persuades its audience.** The facts check out. Persuasion is the author's call.
- **Where the outcome picker sits.** Spec §1.3 says "at the top of the Model step". It sits after two paragraphs inside "How it works", as it did before M14. The C1 restructure is the natural moment to decide.
- **Dark theme beyond the screenshot.** The screenshot showed nothing wrong, and axe runs in both themes in CI. I did not measure contrast myself.
- **Firefox and WebKit.** I probed Chromium only. Firefox has no `scrollend` on older versions, so the pin fallback depends on input events. I didn't exercise it.
- **The deep link `#model-importance` once reading top −65.** One run at 1440×900 with reduced motion (and `#legacy` at 375, −39) showed the target above the viewport. Two traced repeats stayed at 0. I could not reproduce it, so I don't report it as an issue.

### Recommendations

1. **One fix PR for C1, C2, I1 and I2.** They interact: I1's fix makes smooth frames skip the line, so C2 must land with it, and I2's `top: 0` needs the scroll margin. Add the geometry, scrollspy-after-jump and smooth-scroll tests from M4 so the PR's own `ci` proves them under 4× throttle.
2. **M1 and M6 belong in the same PR.** Both are one-liners, and the as-built notes should stop claiming follow-ups that don't exist.
3. **M2, M3, M5, M7 and M8:** fold in if cheap, or file them as `future` issues.
4. **Task reviews of layout work should open the page at more than one width.** Each of C1, C2 and I1 sat behind green tests, because the tests measured either nothing visual or a narrower case than the spec (M11's lesson again).

### Assessment

**Ready to merge? No.**

The anti-goals hold: no marketing voice, no template chrome, the PNW R² in the hero, no lost facts and no broken anchors. The About page is sound. But two of the milestone's three new Methodology devices don't work in the running app:
- The Model step's R² chart draws no bars at any desktop width, and the page scrolls sideways on phones (C1).
- The reading rail forgets the reader's place after every rail, hero or phone-bar jump (C2).

Two Important defects make the navigation feel broken on top of that: the instant, mid-screen landings (I1) and the floating phone bar (I2). All four are small, local fixes. With them and their tests in, the milestone should be ready.
