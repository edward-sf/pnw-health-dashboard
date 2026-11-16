# M14 Methodology and About Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-present the Methodology and About pages for hiring managers. Each page gets a hero. Methodology is organized as a four-step pipeline with a reading rail, and About becomes a four-panel case study. The content stays the same.

**Architecture:**
- **Pages stay where they are.** Methodology stays a single page that composes the existing data-driven section components. A new step config, `steps.ts`, is the one source for the steps, sections and anchors, and the hero, the step headings and the rail all read from it.
- **Small shared pieces:** `MethodologyStep` (step heading), `SectionLayout` (prose plus evidence), `Fold` (`<details>`), `useScrollSpy` (IntersectionObserver), `ReadingRail` and `RailBar` (phone).
- **About** is rebuilt in place from the copy the spec fixes.

**Tech Stack:** React 19, React Router, Tailwind v4 tokens (`web/src/styles.css`), the Radix popover (`components/ui/popover.tsx`), Vitest with Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-m14-methodology-about-redesign-design.md`

## Global Constraints

- **Tokens only.** `web/src/test/tokenUsage.test.ts` sweeps `web/src`. No raw colours, font sizes or radii.
- **No new dependencies.**
- **Hero copy states facts.** No rhetorical questions and no superlatives.
- **The hero's R² is the LightGBM Pacific Northwest R² for the default outcome**, never the national one.
- **Nothing on today's Methodology page is deleted.** Content may move or fold, but every fact stays findable by Ctrl-F. Folds use `<details>`.
- **Every existing anchor keeps working:**
  - section anchors `sources`, `indicators`, `harmonization`, `legacy`, `missing-data`, `suppression`, `unreliable`, `race-breakdown`, `model`, `model-importance`, `no-result`, `exclusions`, `similar-counties` and `model-card`;
  - plus the new step anchors `fetch`, `harmonize`, `model-step` and `publish`.
- **Model copy:** say "associated with", never "causes".
- **Desktop breakpoint:** 721px, the site's existing breakpoint. `PHONE_QUERY` is `(max-width: 720px)`.
- **Motion:** smooth scrolling only when `prefers-reduced-motion` is not set. No entrance animations.
- **E2E specs** import `test` and `expect` from `./fixtures`, and wait on conditions such as attributes and visibility, never on timeouts.
- **Every issue PR keeps `ci` green on its own.**

## Review Focus

1. **A deep link into folded content** (`/methodology#no-result`, `#model-importance`) opens every enclosing `<details>` and focuses the target, which is visible. → Task 2, step 1.
2. **A Pacific Northwest R² that is greater than or equal to the national one** drops the "fits less well" sentence, and the hero still shows the PNW figure. → Task 3, step 1 and Task 4, step 1.
3. **Clicking the last rail item ("Reproduce it") on a tall viewport** marks it current, even when the page can't scroll its top to the spy line. → Task 5, step 1 and Task 7, step 1.
4. **A phone-width reader** can open the rail list, pick a section and land on it with the list closed. Keyboard focus ends on the section heading. → Task 5, step 1 and Task 7, step 1.
5. **A `prefers-reduced-motion` reader** gets an instant jump, not a smooth scroll, when using the rail or the hero strip. → Task 5, step 1.

---

### Task 1: Steps, headings and section layout

**Files:**
- Create: `web/src/pages/methodology/steps.ts`, `web/src/pages/methodology/steps.test.ts`
- Create: `web/src/pages/methodology/MethodologyStep.tsx`, `web/src/pages/methodology/SectionLayout.tsx`, `web/src/pages/methodology/MethodologyStep.test.tsx`
- Modify: `web/src/pages/Methodology.tsx`, `web/src/pages/Methodology.test.tsx`
- Modify: every `*Section.tsx` and `IndicatorCatalog.tsx` in `web/src/pages/methodology/`, plus their tests
- Modify: `web/src/styles.css` (`.methodology` rules)
- Modify: `web/e2e/smoke.spec.ts` (the `no-result` heading level 4 → 5)

**Interfaces:**
- Produces:
  - `type StepId = "fetch" | "harmonize" | "model-step" | "publish"`
  - `type StepSection = { id: string; railLabel: string }`
  - `type Step = { id: StepId; name: string; sections: StepSection[] }`
  - `export const STEPS: Step[]`
  - `export const SECTION_IDS: string[]`, the flattened section ids in page order
  - `MethodologyStep({ step, index, children }: { step: Step; index: number; children: ReactNode })`
  - `SectionLayout({ prose, evidence }: { prose: ReactNode; evidence?: ReactNode })`

- [ ] **Step 1: Write the failing tests**

  `steps.test.ts`:
  - `STEPS` names in order: `["Fetch", "Harmonize", "Model", "Publish"]`.
  - The sections per step match spec §1.2 exactly:
    - fetch → `sources`, `indicators`
    - harmonize → `harmonization`, `missing-data`, `race-breakdown`
    - model-step → `model`, `exclusions`, `similar-counties`
    - publish → `model-card`
  - The rail labels are:
    - "Sources and vintages", "Indicators"
    - "Geography", "Missing and uncertain values", "Outcomes by race and ethnicity"
    - "How it works", "What it leaves out", "Similar counties"
    - "Reproduce it"

  `Methodology.test.tsx`:
  - Each step renders an `h3` named for the step, with an element of id `step.id` and the text "Step n of 4".
  - Every id in `ANCHORS` still exists.
  - Every section heading is level 4. `legacy`, `suppression`, `unreliable`, `model-importance` and `no-result` are level 5.
  - Each section's DOM parent chain contains its step's element.

  `MethodologyStep.test.tsx`:
  - `SectionLayout` with `evidence` renders two children inside `.methodology-section--split`.
  - Without `evidence`, it renders one child and no `--split` class.

- [ ] **Step 2: Run** `cd web && npx vitest run src/pages` and confirm they fail (`steps.ts` is missing).
- [ ] **Step 3: Implement the steps.**
  - `steps.ts` holds the config above.
  - Each `MethodologyStep` renders a `section` labelled by an `h3`. The `h3` has `id={step.id}` and `tabIndex={-1}`, and a muted `<span>` reading `Step {index + 1} of {STEPS.length}`.
  - `Methodology.tsx` renders the sections inside their steps, in `STEPS` order. Keep the `methodology-toc` nav for now, built from `STEPS`; Task 5 replaces it.
- [ ] **Step 4: Shift the heading levels and apply the layout.**
  - Shift every section `h3` to `h4` and every `h4` to `h5`. Ids and `tabIndex` stay.
  - Rename the `model` section's heading to "How it works". Its id stays `model`.
  - Wrap each section's opening in `SectionLayout`:
    - **Evidence:** Sources (the data-sources table), Exclusions (its first table) and Reproducibility (its `dl`).
    - **One column:** all other sections.
    - **Model:** gets its evidence in Task 3.
  - CSS:
    - `.methodology-section--split` is `grid-template-columns: 1fr 1fr` from 721px, with one column below.
    - The prose column's `max-width` is `65ch`.
    - The evidence box uses `--surface`, `--line` and `--radius-lg`.
    - The step heading's hairline uses `--line`.
- [ ] **Step 5: Run** `cd web && npm test && npm run lint && npm run typecheck` and expect PASS. Update `e2e/smoke.spec.ts` line 174 to `level: 5`.
- [ ] **Step 6: Commit** with `feat(web): methodology grouped into four pipeline steps with a prose-and-evidence layout`.

### Task 2: Folds and deep links into them

**Files:**
- Create: `web/src/pages/methodology/Fold.tsx`, `web/src/pages/methodology/Fold.test.tsx`
- Modify: `web/src/pages/methodology/useHashFocus.ts`, `useHashFocus.test.tsx`
- Modify: `IndicatorCatalog.tsx`, `ExclusionsSection.tsx`, `ReproducibilitySection.tsx`, `ModelSection.tsx` and their tests
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: Task 1's section components.
- Produces: `Fold({ summary, children }: { summary: string; children: ReactNode })`, which renders `<details className="methodology-fold"><summary>{summary}</summary>…</details>`.

- [ ] **Step 1: Write the failing tests.**
  - `useHashFocus.test.tsx`: with `#target` nested in two closed `<details>`, after `ready`, both are `open` and `#target` has focus.
  - `Fold.test.tsx`: the fold is closed by default, and its children are in the DOM (so find-in-page works).
  - `IndicatorCatalog.test.tsx`:
    - Each category shows "Including A, B and C." naming its first three indicators by label (fewer if the category has fewer).
    - A closed fold with summary "Show all N indicators" contains the category's full table.
  - `ModelSection.test.tsx`:
    - The full factor `<ol>` is inside a fold with summary `Show all ${n} factors`.
    - The `model-importance` heading sits outside the fold, above it.
  - `ExclusionsSection.test.tsx`: the "Counties left out of training" list is inside a fold.
  - `ReproducibilitySection.test.tsx`: "LightGBM parameters" is inside a fold.
- [ ] **Step 2: Run** `cd web && npx vitest run src/pages/methodology` and expect FAIL.
- [ ] **Step 3: Extend `useHashFocus`.** Before scrolling, open every ancestor `<details>` of the target: walk `el.parentElement.closest("details")` upward and set `open = true` on each.
- [ ] **Step 4: Add `Fold` and wrap the four places above.** Style the summary as a link-weight `--evergreen` control with the global focus ring, and give it no custom marker beyond the browser's.
- [ ] **Step 5: Run** `cd web && npm test && npm run lint && npm run typecheck` and expect PASS.
- [ ] **Step 6: Commit** with `feat(web): fold long methodology lists; deep links open their folds`.

### Task 3: Model step evidence

**Files:**
- Create: `web/src/pages/methodology/R2Comparison.tsx`, `R2Comparison.test.tsx`
- Create: `web/src/pages/methodology/FactorBars.tsx`, `FactorBars.test.tsx`
- Modify: `ModelSection.tsx`, `ModelSection.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: Task 1's `SectionLayout` and Task 2's `Fold`.
- Produces:
  - `R2Comparison({ national, pnw }: { national: number; pnw: number })`
  - `FactorBars({ items }: { items: { label: string; value: number; display: string }[] })`, which renders exactly the items given

- [ ] **Step 1: Write the failing tests.**
  - `R2Comparison`:
    - With `{ national: 0.64, pnw: 0.41 }`, the labels are "Nationally" and "Pacific Northwest", the values are `formatMetric`'d ("0.64", "0.41"), and the text "The region fits less well than the country." is present.
    - With `{ national: 0.5, pnw: 0.6 }`, that sentence is absent.
    - The caption is "R² on counties the model didn't train on".
  - `FactorBars`:
    - Three items render three bars.
    - Each bar's `style.width` is proportional to its `value` against the largest value, so the largest is `100%`.
    - Every label and `display` is visible.
  - `ModelSection`:
    - The section's evidence slot holds `R2Comparison`, fed by the selected target's `metrics.lightgbm.national.r2` and `.pnw.r2`.
    - `FactorBars` shows the top 3 by `mean_abs_shap` under the `model-importance` heading.
    - The sentence "Ranked by how strongly each is associated with the model's estimate. Associations, not causes." is present.
    - `MetricsTable` is still rendered.
- [ ] **Step 2: Run** `cd web && npx vitest run src/pages/methodology` and expect FAIL.
- [ ] **Step 3: Implement.**
  - **R² bars:** the national bar uses `--chart-muted` and the PNW bar uses `--evergreen`. Width is `r2 × 100%`, clamped to 0–100.
  - **Factor bars** use `--chart-muted`.
  - **The bars are decorative** (`aria-hidden`). The figures are in text.
  - **Prose:** move the "Two models are compared…" paragraph and the cross-validation paragraph into the prose column, tightened. Keep each fact.
- [ ] **Step 4: Run** `cd web && npm test && npm run lint && npm run typecheck` and expect PASS.
- [ ] **Step 5: Commit** with `feat(web): model step shows its R² and top factors as bars`.

### Task 4: Hero and pipeline strip; retire At a glance

**Files:**
- Create: `web/src/pages/methodology/pipelineFigures.ts`, `pipelineFigures.test.ts`
- Create: `web/src/pages/methodology/PipelineHero.tsx`, `PipelineHero.test.tsx`
- Delete: `web/src/pages/methodology/AtAGlance.tsx`, `AtAGlance.test.tsx`
- Modify: `web/src/pages/Methodology.tsx`, `Methodology.test.tsx`, `web/src/App.test.tsx`, `web/e2e/smoke.spec.ts`
- Modify: `web/src/styles.css` (remove `.at-a-glance` rules, add `.pipeline-*` rules)

**Interfaces:**
- Consumes: `STEPS` from Task 1.
- Produces:
  - `type PipelineFigures = { sources: number; counties: number; pnwR2: number; outcomes: number }`
  - `pipelineFigures(data: AppData): PipelineFigures`
  - `PipelineHero({ data }: { data: AppData })`

- [ ] **Step 1: Write the failing tests.**
  - `pipelineFigures` with the test fixtures: `sources` is 4 (distinct `source` values, so the two `chr` rows count once), `counties` equals the topology's fips count, `pnwR2` equals the default target's `metrics.lightgbm.pnw.r2`, and `outcomes` equals `Object.keys(model.targets).length`.
  - `PipelineHero`:
    - The `h2` is named "How the atlas is built" and keeps `data-page-heading`.
    - The lede is "Public data for every US county, narrowed to {counties} in the Pacific Northwest, and a model tested on states it never saw."
    - A `nav` named "Pipeline steps" holds 4 links to `#fetch`, `#harmonize`, `#model-step` and `#publish`.
    - Each link contains its figure and label: "{sources} public sources", "{counties} counties", "{pnwR2 formatted} R² in the region", "5 data files".
    - The step descriptions match spec §1.1.
  - `Methodology.test.tsx`: no element has the text "At a glance". In the loading and error states, the `h2` is still "How the atlas is built".
  - `App.test.tsx` and `e2e/smoke.spec.ts`: update the Methodology `h2` name assertions to "How the atlas is built".
- [ ] **Step 2: Run** `cd web && npx vitest run src` and expect FAIL.
- [ ] **Step 3: Implement.**
  - Move the topology fips extraction from `AtAGlance` into `pipelineFigures`. Delete `AtAGlance` and its test.
  - The associations sentence and the top factors already live in the Model step after Task 3. Confirm with a grep that "These are associations" or an equivalent survives on the page.
  - **Strip layout:** a 4-column grid from 721px and 2×2 below.
  - **Figures** use `--text-2xl`, weight 800 and `tabular-nums`.
  - **Chevrons** between steps are CSS (`--line`) and hidden below 721px.
  - The `h2` renders outside the ready check, so it shows in every state.
- [ ] **Step 4: Run** `cd web && npm test && npm run lint && npm run typecheck` and expect PASS.
- [ ] **Step 5: Commit** with `feat(web): methodology hero with the pipeline strip; retire At a glance`.

### Task 5: Reading rail and phone bar

**Files:**
- Create: `web/src/pages/methodology/useScrollSpy.ts`, `useScrollSpy.test.tsx`
- Create: `web/src/pages/methodology/ReadingRail.tsx`, `ReadingRail.test.tsx`
- Modify: `web/src/pages/Methodology.tsx`, `Methodology.test.tsx`, `web/src/styles.css` (remove `.methodology-toc`)

**Interfaces:**
- Consumes: `STEPS` and `SECTION_IDS` from Task 1.
- Produces:
  - `useScrollSpy(ids: string[], ready: boolean): { current: string | null; pin: (id: string) => void }`
  - `ReadingRail({ current, onPick }: { current: string | null; onPick: (id: string) => void })`, which renders the desktop rail, or the phone bar when `useMediaQuery(PHONE_QUERY)` is true

- [ ] **Step 1: Write the failing tests.** Use a mocked `IntersectionObserver` whose callback the test fires by hand.
  - `useScrollSpy`:
    - With nothing past the line, `current` is `null`.
    - When `model` crosses the line, `current` is `"model"`.
    - When the bottom sentinel intersects, `current` is the last id.
    - `pin("model-card")` sets `current` at once and ignores observer callbacks until a `scrollend` event is dispatched on `window`.
  - `ReadingRail` (desktop):
    - A `nav` named "On this page" lists the four step names, each followed by its sections' rail labels as links to `#id`.
    - The current section's link has `aria-current="location"`, and its step name has the class `is-current`.
  - `ReadingRail` (phone, with `mockMatchMedia` set to phone):
    - A button reads "Model · How it works" when current is `model`, and "On this page" when current is `null`.
    - Clicking it opens a popover with the same list.
    - Clicking "Reproduce it" calls `onPick("model-card")` and closes the popover.
  - `Methodology.test.tsx`: there is no `.methodology-toc`. Clicking a rail link navigates to `#id`, and its heading gets focus through `useHashFocus`.
  - **Reduced motion** (`mockMatchMedia` for `(prefers-reduced-motion: reduce)`): `scrollIntoView` is called with `{ behavior: "auto" }`. Otherwise it's called with `"smooth"`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/pages` and expect FAIL.
- [ ] **Step 3: Implement `useScrollSpy`.**
  - One `IntersectionObserver` with `rootMargin` `calc`'d as `-(header height + 25% of viewport) 0px -(75% − header) 0px`. Compute it in px from `--header-height` and `window.innerHeight`, and recreate it on resize through a `ResizeObserver` on `document.documentElement`.
  - `current` is the last id, in page order, whose element's top is above the line.
  - A second observer watches a zero-height sentinel `div#methodology-end` rendered after the last step. While it's visible, `current` is the last id.
  - `pin` overrides until `scrollend`. Where `"onscrollend" in window` is false, release on the next `wheel`, `touchstart` or `keydown`.
- [ ] **Step 4: Implement `ReadingRail` and wire it in.**
  - `onPick` pins, then navigates with `navigate({ hash: id })`.
  - Pass a `smooth` flag into `useHashFocus` (add `scrollIntoView({ behavior })`), computed from `prefers-reduced-motion`.
  - **Desktop layout:** a two-column grid, with the rail `position: sticky; top: calc(var(--header-height) + 1rem)` in an 11rem column.
  - **Phone bar:** `position: sticky; top: var(--header-height)`, a `--surface` background and a `--line` bottom border.
  - The current marker is a 2px `--evergreen` left border and weight 700. The current step name is `--evergreen`.
- [ ] **Step 5: Run** `cd web && npm test && npm run lint && npm run typecheck` and expect PASS.
- [ ] **Step 6: Commit** with `feat(web): methodology reading rail with scrollspy, and a phone bar`.

### Task 6: About as a case study

**Files:**
- Modify: `web/src/pages/About.tsx`, `web/src/pages/About.test.tsx`, `web/src/App.test.tsx`, `web/e2e/smoke.spec.ts`
- Modify: `web/src/styles.css` (replace the `.about` rules and `.about-profiles`)

**Interfaces:**
- Consumes: `buttonVariants`, `GitHubIcon` and `LinkedInIcon`.
- Produces: none.

- [ ] **Step 1: Write the failing tests** in `About.test.tsx`.
  - The `h2` is "A public health atlas, built end to end".
  - The lede is the spec §2.1 sentence, verbatim.
  - A link named "View the source on GitHub" goes to `https://github.com/edward-sf/pnw-health-dashboard` and has the primary variant class.
  - A link named "LinkedIn" goes to `https://www.linkedin.com/in/edward-sf`.
  - The text "Edward Simpson-Fitzgibbon" is present, with no role line.
  - Four `h3`s: "Data pipeline", "Model", "Site and delivery", "Agent workflow".
  - Each panel contains its spec §2.2 description, chips and proof point, verbatim.
  - The Model proof links to `/methodology#model-step`.
  - The Agent workflow panel links to `https://github.com/edward-sf/pnw-health-dashboard/blob/main/workflow/README.md`.
  - The explorer line from spec §2.3 links "New to the explorer?" to `/`.
  - The footer has 4 source links, "not affiliated", the associations line and the MIT license link.
  - There are no "How to use it" or "Built with" headings.
  - Update the About `h2` name in `App.test.tsx` and `e2e/smoke.spec.ts`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/pages/About.test.tsx` and expect FAIL.
- [ ] **Step 3: Implement.**
  - **Before writing each proof point,** confirm it against the repository:
    - `.github/workflows/ci.yml`: the e2e job and the throttled repeat.
    - `.claude/hooks/guard-merge.sh`.
    - `pipeline/src/pnw_health/model/cv.py`: the state-grouped folds and the ridge baseline.
    - `schema/` and `npm run gen:types`.
  - **Layout:**
    - Panels form a 2×2 grid from 721px and one column below.
    - Panels use `--surface`, `--line` and `--radius-lg`.
    - Chips use `--radius-full` and `--line`.
    - The proof point has a 2px `--fir-soft` left border.
- [ ] **Step 4: Run** `cd web && npm test && npm run lint && npm run typecheck` and expect PASS.
- [ ] **Step 5: Commit** with `feat(web): About as a four-panel case study`.

### Task 7: E2E, design guide and as-built notes

**Files:**
- Create: `web/e2e/methodology.spec.ts`
- Modify: `web/e2e/a11y.spec.ts`
- Modify: `docs/design-system.md`
- Modify: `docs/superpowers/specs/2026-11-15-m14-methodology-about-redesign-design.md` (an as-built section)
- Create: `docs/images/methodology.png`, `docs/images/about.png`
- Modify: `README.md` (screenshots)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the e2e tests** in `methodology.spec.ts`, importing from `./fixtures`.
  - **Scrollspy:** scroll `#model` into view, then expect the rail link "How it works" to have `aria-current="location"`.
  - **Last item:** click "Reproduce it" at 1440×1600, then expect it to have `aria-current` and `#model-card` to be focused.
  - **Deep links:** for each of `legacy`, `suppression`, `unreliable`, `no-result`, `model-importance` and `similar-counties`, goto `./methodology#id`, then expect the target to be visible and focused.
  - **Hero strip:** clicking "Model" goes to `#model-step`, which is focused.
  - **Phone (375×812):** the bar shows "Fetch · Sources and vintages" after scrolling to `#sources`. Tap it, tap "Similar counties", then expect `#similar-counties` to be focused and the popover hidden.

  `a11y.spec.ts`: add phone-width axe runs for both pages, alongside the existing desktop runs in both themes.
- [ ] **Step 2: Run** `cd web && npm run build && CI=1 npx playwright test` and expect PASS. Also run `E2E_CPU_THROTTLE=4 CI=1 npx playwright test e2e/methodology.spec.ts --repeat-each=3` and expect PASS.
- [ ] **Step 3: Design guide.** Add `docs/design-system.md` entries for the reading rail, the pipeline strip, the prose-and-evidence section, the fold and the About panel. Each entry says when to use the component and which tokens it uses.
- [ ] **Step 4: As-built notes.** Add an "As built" section to the spec listing every place the implementation differs from it. Take light-theme screenshots of both pages at 1440 wide into `docs/images/`, and reference them in `README.md`.
- [ ] **Step 5: Commit** with `docs: M14 design guide entries, as-built notes and screenshots; methodology e2e`.

```toml workflow-tasks
[[task]]
id = "T1"
title = "Methodology steps, headings and section layout"
steps = 6
depends_on = []
files = ["web/src/pages/methodology/steps.ts", "web/src/pages/methodology/steps.test.ts", "web/src/pages/methodology/MethodologyStep.tsx", "web/src/pages/methodology/SectionLayout.tsx", "web/src/pages/methodology/MethodologyStep.test.tsx", "web/src/pages/Methodology.tsx", "web/src/pages/Methodology.test.tsx", "web/src/pages/methodology/SourcesSection.tsx", "web/src/pages/methodology/SourcesSection.test.tsx", "web/src/pages/methodology/IndicatorCatalog.tsx", "web/src/pages/methodology/IndicatorCatalog.test.tsx", "web/src/pages/methodology/HarmonizationSection.tsx", "web/src/pages/methodology/HarmonizationSection.test.tsx", "web/src/pages/methodology/MissingDataSection.tsx", "web/src/pages/methodology/MissingDataSection.test.tsx", "web/src/pages/methodology/RaceBreakdownSection.tsx", "web/src/pages/methodology/RaceBreakdownSection.test.tsx", "web/src/pages/methodology/ModelSection.tsx", "web/src/pages/methodology/ModelSection.test.tsx", "web/src/pages/methodology/ExclusionsSection.tsx", "web/src/pages/methodology/ExclusionsSection.test.tsx", "web/src/pages/methodology/PeersSection.tsx", "web/src/pages/methodology/PeersSection.test.tsx", "web/src/pages/methodology/ReproducibilitySection.tsx", "web/src/pages/methodology/ReproducibilitySection.test.tsx", "web/src/styles.css", "web/e2e/smoke.spec.ts"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T2"
title = "Methodology folds and deep links into them"
steps = 6
depends_on = ["T1"]
files = ["web/src/pages/methodology/Fold.tsx", "web/src/pages/methodology/Fold.test.tsx", "web/src/pages/methodology/useHashFocus.ts", "web/src/pages/methodology/useHashFocus.test.tsx", "web/src/pages/methodology/IndicatorCatalog.tsx", "web/src/pages/methodology/IndicatorCatalog.test.tsx", "web/src/pages/methodology/ExclusionsSection.tsx", "web/src/pages/methodology/ExclusionsSection.test.tsx", "web/src/pages/methodology/ReproducibilitySection.tsx", "web/src/pages/methodology/ReproducibilitySection.test.tsx", "web/src/pages/methodology/ModelSection.tsx", "web/src/pages/methodology/ModelSection.test.tsx", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T3"
title = "Methodology model step evidence"
steps = 5
depends_on = ["T2"]
files = ["web/src/pages/methodology/R2Comparison.tsx", "web/src/pages/methodology/R2Comparison.test.tsx", "web/src/pages/methodology/FactorBars.tsx", "web/src/pages/methodology/FactorBars.test.tsx", "web/src/pages/methodology/ModelSection.tsx", "web/src/pages/methodology/ModelSection.test.tsx", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T4"
title = "Methodology hero and pipeline strip"
steps = 5
depends_on = ["T3"]
files = ["web/src/pages/methodology/pipelineFigures.ts", "web/src/pages/methodology/pipelineFigures.test.ts", "web/src/pages/methodology/PipelineHero.tsx", "web/src/pages/methodology/PipelineHero.test.tsx", "web/src/pages/methodology/AtAGlance.tsx", "web/src/pages/methodology/AtAGlance.test.tsx", "web/src/pages/Methodology.tsx", "web/src/pages/Methodology.test.tsx", "web/src/App.test.tsx", "web/e2e/smoke.spec.ts", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T5"
title = "Methodology reading rail and phone bar"
steps = 6
depends_on = ["T4"]
files = ["web/src/pages/methodology/useScrollSpy.ts", "web/src/pages/methodology/useScrollSpy.test.tsx", "web/src/pages/methodology/ReadingRail.tsx", "web/src/pages/methodology/ReadingRail.test.tsx", "web/src/pages/methodology/useHashFocus.ts", "web/src/pages/methodology/useHashFocus.test.tsx", "web/src/pages/Methodology.tsx", "web/src/pages/Methodology.test.tsx", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T6"
title = "About as a case study"
steps = 5
depends_on = ["T5"]
files = ["web/src/pages/About.tsx", "web/src/pages/About.test.tsx", "web/src/App.test.tsx", "web/e2e/smoke.spec.ts", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T7"
title = "Methodology e2e, design guide and as-built notes"
steps = 5
depends_on = ["T6"]
files = ["web/e2e/methodology.spec.ts", "web/e2e/a11y.spec.ts", "docs/design-system.md", "docs/superpowers/specs/2026-11-15-m14-methodology-about-redesign-design.md", "docs/images/methodology.png", "docs/images/about.png", "README.md"]
labels = ["area:web", "area:docs", "type:feature"]
```
