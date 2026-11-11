# M6 Methodology + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A methodology page built from the exports, an About page, a phone layout with a bottom sheet, a WCAG 2.1 AA pass checked by axe, and a portfolio README.

**Architecture:** `/methodology` takes the `DataState` that `App` already loads and renders one small component per section; every number comes from `manifest.json` or `model.json` through a few pure helpers. Phone behavior hangs off one `useMediaQuery(PHONE_QUERY)` hook: `CountyPanel` becomes a non-modal bottom sheet and `IndicatorPicker` a disclosure. The accessibility pass restructures `App`'s landmarks, adds per-route titles and focus, and gates regressions with axe in Playwright.

**Tech Stack:** React 19, TypeScript 6.0, React Router 8, Vitest, Testing Library, Playwright 1.65 (+ `@axe-core/playwright`). No pipeline changes.

**Spec:** `docs/superpowers/specs/2026-11-11-m6-methodology-polish-design.md`, with parent `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md`. **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`.

## Global Constraints

- All earlier web constraints still apply: FIPS are 5-character strings, TypeScript stays `~6.0.3`, import from `react-router`, URLs go through `import.meta.env.BASE_URL`, null is not zero (`??`, never `||`, on values).
- No pipeline, contract or schema changes, and no new runtime dependencies. The only new dev dependency is `@axe-core/playwright`, pinned to an exact version.
- Methodology numbers: R², RMSE, MAE to 2 decimals; years of life expectancy to 1 decimal; counts with thousands separators (`toLocaleString("en-US")`). No number about the data or model is typed into copy.
- Copy never describes the factors with "cause(s)/caused", "driver(s)/drive(s)" or "explain(s) the difference". Say "associated with".
- Phone breakpoint, exactly: `PHONE_QUERY = "(max-width: 720px)"`. Tablet (721–1099px) and desktop layouts don't change.
- Sheet heights: peek `40dvh`, expanded `85dvh`. Phone touch targets ≥ 44×44 CSS px.
- Page titles, exactly: "PNW Health Dashboard", "Methodology · PNW Health Dashboard", "About · PNW Health Dashboard".
- Web checks: `cd web && npm run lint && npm run typecheck && npm test`. Playwright: `cd web && npm run build && npm run test:e2e`.

## Review Focus

1. **Deep link before data loads.** Opening `/methodology#legacy` cold shows "Loading data…" first; once sections render, the `#legacy` heading must still be scrolled to and focused. *(Test in T1.)*
2. **An id the web doesn't know.** A source id with no display name, a feature missing from the manifest, or an excluded-state FIPS not in `STATE_FIPS_NAMES` shows the raw id instead of crashing or printing "undefined". *(Test in T1.)*
3. **Crossing 720px with a county open.** Rotating a phone or resizing a window switches the panel between sheet and side panel without losing the county or the heading. *(Test in T4.)*
4. **Another county tapped while the sheet is expanded.** The sheet drops back to peek and shows the new county. *(Test in T4.)*
5. **Escape with the picker disclosure open on a phone.** It closes the disclosure only; the county sheet stays open. *(Test in T4.)*

---

### Milestone start (no issue)

- [ ] **Step 1:** `milestone/m6` exists locally with the spec commit (`ac59827`). Confirm it's based on current `origin/main` (`git merge-base --is-ancestor origin/main milestone/m6`).
- [ ] **Step 2:** Apply spec §9: the roadmap's M6 list becomes T1–T5 as in spec §7; parent spec §6's county-panel line points at M6 spec §5 for phone behavior. In `docs/milestone-review-template.md`, M6 gains "the panel's Methodology links land on the right section", "axe reports no serious or critical violations; the manual checklist is filled in" and "the bottom sheet is usable one-handed on a real phone".
- [ ] **Step 3:** Commit to `milestone/m6`: `docs: add M6 plan and doc updates`.
- [ ] **Step 4:** Push with `-u origin milestone/m6` and open the draft PR `milestone/m6 → main` using `.github/PULL_REQUEST_TEMPLATE/milestone.md`.
- [ ] **Step 5:** Reconcile issues. Replace the "Provisional" bodies of #37, #38, #39 and #40 with a link to their task here and its acceptance criteria. Retitle #40 `M6.T4 Mobile layout: bottom sheet, touch and picker`. Create `M6.T5 Accessibility pass` (`type:feature`, `area:web`, milestone M6). Move all five to `Ready`.

### Task M6.T1: Methodology page (#37)

**Files:**
- Create in `web/src/pages/methodology/`: `format.ts`, `stateFipsNames.ts`, `excludedCounties.ts`, `useHashFocus.ts`, `MetricsTable.tsx`, `AtAGlance.tsx`, `SourcesSection.tsx`, `IndicatorCatalog.tsx`, `HarmonizationSection.tsx`, `MissingDataSection.tsx`, `ModelSection.tsx`, `ExclusionsSection.tsx`, `ReproducibilitySection.tsx`, each with a `.test.ts(x)`.
- Modify: `web/src/pages/Methodology.tsx` (+ new `Methodology.test.tsx`), `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/panel/CountyPanel.tsx` (+ test), `web/src/panel/ModelCard.tsx` (+ test), `web/src/test/fixtures/manifest.ts`, `web/src/test/fixtures/model.ts`, `web/src/styles.css`

**Interfaces:**
- Produces:
  - `format.ts`: `formatMetric(v: number): string` (2 decimals); `formatCount(n: number): string`; `featureLabel(id: string, indicators: Indicator[]): string` (manifest label, else the raw id); `type MetricSet = ModelFile["metrics"]["ridge"]["national"]`.
  - `stateFipsNames.ts`: `STATE_FIPS_NAMES: Record<string, string>` (50 states, `"11"` District of Columbia, `"72"` Puerto Rico); `stateNameForFips(fips: string): string` (takes a 2- or 5-character FIPS; unknown → the 2-character prefix).
  - `excludedCounties.ts`: `groupExcludedCounties(list: { fips: string; reason: string }[]): { reason: string; count: number; states: string[] }[]`, grouped by exact reason, sorted by count descending then reason; `states` are distinct names in first-seen order.
  - `useHashFocus(ready: boolean): void`: when `ready` and `location.hash` names an element id, calls `scrollIntoView?.()` (optional: jsdom lacks it) and `focus()` on it; reruns when the hash changes; ignores a hash with no match.
  - `MetricsTable({ caption, rows }: { caption: string; rows: { model: string; national: MetricSet; pnw: MetricSet }[] })`: a `<table>` with a `<caption>`, columns Model, Area ("United States" / "Pacific Northwest"), R², RMSE, MAE, Counties; two body rows per model.
  - `Methodology({ state }: { state: DataState })`. `App` passes its `useData()` state.
  - Anchors are `id`s on the section headings, each with `tabIndex={-1}`: `sources`, `indicators`, `harmonization`, `legacy` (h3), `missing-data`, `suppression` (h3), `unreliable` (h3), `model`, `exclusions`, `model-card`.
  - Source display names live in `SourcesSection.tsx`: `acs` "Census American Community Survey (5-year)", `places` "CDC PLACES", `chr` "County Health Rankings & Roadmaps", `boundaries` "Census cartographic boundary files". A `chr` row whose year is below the highest `chr` year is labelled "(legacy values for the former Valdez-Cordova Census Area)".
- Fixtures: `manifest.sources` gains `chr` 2025, `chr` 2023 and `boundaries` 2024. `model.model_card` currently has empty exclusion lists and `lightgbm_params: {}`; fill them as below and give `lightgbm_params` two entries. `model.behaviors_comparison.excluded_states` gains `{ state_fips: "21", counties: 120, reason: "PLACES does not report these behavior measures for this state's counties." }`. `model.model_card.excluded_counties` holds two Connecticut FIPS (`09001`, `09003`) with one reason and one other county with a second reason.

- [ ] **Step 1: Write failing tests.**
  - `format.test.ts`: `formatMetric(0.41224)` → `"0.41"`; `formatCount(3060)` → `"3,060"`; `featureLabel("poverty_rate", manifest.indicators)` → `"Poverty rate"`; `featureLabel("not_a_feature", …)` → `"not_a_feature"`.
  - `stateFipsNames.test.ts`: 52 entries; `stateNameForFips("21")` → `"Kentucky"`; `stateNameForFips("09001")` → `"Connecticut"`; `stateNameForFips("99")` → `"99"`.
  - `excludedCounties.test.ts`: the fixture list gives `[{ count: 2, states: ["Connecticut"], … }, { count: 1, … }]`.
  - Section tests render each component with the fixtures and assert on text: `AtAGlance` shows the fixture's PNW and national LightGBM R² (`"0.70"`, `"0.80"`) and the top three features by `mean_abs_shap` as labels; `SourcesSection` has one row per manifest source, the legacy label on `chr` 2023, and an unknown source id shown raw; `IndicatorCatalog` groups by category with "higher is worse" for `poverty_rate`; `ModelSection` shows `formatCount(training_counties)`, `n_folds`, both models in the metrics table and `z_75`/`z_90`; `ExclusionsSection` shows "2 counties in Connecticut", "Kentucky" for state 21, and states that only the behaviors model's metrics are used; `ReproducibilitySection` shows the seed, LightGBM version and `built_at` date.
  - `Methodology.test.tsx`: loading state shows "Loading data…"; error state shows "Couldn't load the data" and retry calls `retry`; ready state renders every anchor id above. Starting at `/methodology#legacy` in `loading`, then rerendering `ready`, focuses the `#legacy` heading (Review Focus 1). The page's text never matches `/\b(caus(e|es|ed)|driv(e|es|er|ers))\b/i`.
  - `CountyPanel.test.tsx` and `ModelCard.test.tsx`: the Methodology links' `href`s end in `#unreliable`, `#suppression`, `#legacy` and `#model` in their respective states.
  - `App.test.tsx`: replace the "/methodology renders the stub" test with one that shows the "Methodology" heading and "At a glance" after data loads.
- [ ] **Step 2:** Run `npm test`; the new tests fail on missing modules or text, not on unrelated imports.
- [ ] **Step 3: Implement.** Write the section prose from spec §3.2. The tier text states the formula as plain text: each county's range is `z × √(σ_model² + se²)`, with `σ_model` and both `z` values from `thresholds`. The At a glance box says plainly that the model fits the national pattern better than the PNW when PNW R² < national R². `Methodology` renders `<h2 tabIndex={-1}>Methodology</h2>`, the At a glance box, a `<nav aria-label="On this page">` table of contents, then the sections, and calls `useHashFocus(state.status === "ready")`.
- [ ] **Step 4:** Run the web checks; all pass. Open `/methodology` in `npm run dev` against the real export and check the numbers against `model.json`.
- [ ] **Step 5:** Commit: `feat(web): add the methodology page`. PR body: `Part of #37`.

### Task M6.T2: About page (#38)

**Files:**
- Modify: `web/src/pages/About.tsx`, `web/src/App.test.tsx`, `web/src/styles.css`, `web/e2e/smoke.spec.ts`
- Create: `web/src/pages/About.test.tsx`

**Interfaces:**
- Produces: `About()` with no props and no data dependency; its heading is `<h2 tabIndex={-1}>About</h2>`.

- [ ] **Step 1:** Ask the author for their LinkedIn URL. Don't guess it.
- [ ] **Step 2: Write failing tests.** `About.test.tsx`: headings "What this is", "How to use it", "Built with", "Data credits", "Author"; links to `https://github.com/edward-sf`, `https://github.com/edward-sf/pnw-health-dashboard`, the LinkedIn URL, the repo's `LICENSE`, and the four data sources; a not-affiliated line; an internal link to `/methodology`. `App.test.tsx`: `/about` renders the About heading while `fetch` rejects. `smoke.spec.ts`: `test("methodology and about pages render")` visits `./methodology` (heading "Methodology", text "At a glance", a link whose `href` ends `#model` in the table of contents) and `./about` (heading "About").
- [ ] **Step 3:** Run `npm test`; the new tests fail.
- [ ] **Step 4:** Implement spec §4.1. External links open in the same tab.
- [ ] **Step 5:** Run the web checks; all pass.
- [ ] **Step 6:** Commit: `feat(web): add the about page`. PR body: `Part of #38`.

### Task M6.T4: Mobile layout (#40)

**Files:**
- Create: `web/src/hooks/useMediaQuery.ts` (+ test), `web/src/test/matchMedia.ts`, `web/e2e/mobile.spec.ts`
- Modify: `web/src/panel/CountyPanel.tsx` (+ test), `web/src/map/CountyMap.tsx` (+ test), `web/src/explorer/IndicatorPicker.tsx` (+ test), `web/src/explorer/Explorer.tsx` (+ test), `web/src/styles.css`, `web/playwright.config.ts`

**Interfaces:**
- Produces:
  - `useMediaQuery(query: string): boolean`, built on `useSyncExternalStore`; returns `false` when `window.matchMedia` is missing. `export const PHONE_QUERY = "(max-width: 720px)"`.
  - Test helper `mockMatchMedia(initial: boolean): { set(matches: boolean): void }`. It installs a `window.matchMedia` whose `change` listeners fire on `set`. `setup.ts` resets it after each test.
  - `CountyPanel` reads `useMediaQuery(PHONE_QUERY)` itself; no new props. In sheet mode the `<aside>` gets class `county-panel--sheet`, plus `county-panel--expanded` when expanded. The body has a `useId()` id, and the header has an Expand/Collapse button (`aria-expanded`, `aria-controls` = body id) before Close. Expanded state is stored as the FIPS it applies to, so a new county is in peek without remounting.
  - `IndicatorPicker` gains `collapsible?: boolean`. When true it renders a `<button aria-expanded>` labelled `Indicator: {selected label}` and shows the search and list only when open. Choosing an indicator closes it and focuses the button. Escape inside it closes it, calls `preventDefault()` and focuses the button.
  - `Explorer` passes `collapsible={isPhone}` and adds class `explorer--sheet-open` when phone and a county is selected (bottom padding `40dvh` on the map area).
  - `CountyMap`: `onPointerEnter`/`onPointerMove`/`onPointerLeave` replace the mouse handlers; any event with `pointerType === "touch"` hides the tooltip and returns.
  - Playwright projects: `chromium` (Desktop Chrome, `testIgnore: /mobile\.spec\.ts/`) and `mobile` (`devices["Pixel 7"]`, `testMatch: /(mobile|a11y)\.spec\.ts/`).

- [ ] **Step 1: Write failing tests.**
  - `useMediaQuery.test.tsx`: initial value follows the mock; `set(true)` rerenders with `true`; no `matchMedia` → `false`.
  - `CountyPanel.test.tsx` (phone mock): has class `county-panel--sheet`; Expand toggles `aria-expanded` and the class, and its label changes to Collapse; rerendering with a different county returns to peek and shows the new name (Review Focus 4); `set(false)` with a county open drops the sheet classes and keeps the heading (Review Focus 3); Escape calls `onClose`. Desktop mock: no Expand button.
  - `CountyMap.test.tsx`: `pointerEnter` with `pointerType: "mouse"` shows the tooltip; with `"touch"` it doesn't; a click still calls `onSelect`.
  - `IndicatorPicker.test.tsx` (`collapsible`): the list is hidden and the button reads "Indicator: Poverty rate"; opening shows the search box; choosing "Median household income" calls `onSelect`, closes and focuses the button; Escape closes it and leaves the event `defaultPrevented`.
  - `Explorer.test.tsx` (phone mock, `?c=53033`): Escape with the disclosure open keeps the county panel (Review Focus 5); `explorer--sheet-open` is present.
  - `mobile.spec.ts` on the real build: `goto("./?i=poverty_rate")`; `tap` `path[data-fips="53033"]` → `.county-panel--sheet` visible with "King County" and no `[role=tooltip]`; tap Expand → `aria-expanded="true"`; Collapse; Close → no panel and no `c` in the URL. Then tap "Indicator: …", choose "Median household income" → the URL has `i=median_household_income` and the list is hidden.
- [ ] **Step 2:** Run `npm test` and `npm run test:e2e`; the new tests fail.
- [ ] **Step 3: Implement** spec §5. In CSS under `@media (max-width: 720px)`: the sheet is `position: fixed` at the bottom with `height: 40dvh` (expanded `85dvh`), `overflow-y: auto`, rounded top corners and a decorative handle (`aria-hidden`). Buttons, `.view-toggle` buttons and table sort buttons get `min-height: 44px; min-width: 44px`. Under `prefers-reduced-motion: reduce` the height transition is off.
- [ ] **Step 4:** Run the web checks and e2e on both projects; all pass. Check by hand in the Playwright mobile viewport that a county at the bottom of the map is still tappable with a sheet open.
- [ ] **Step 5:** Commit: `feat(web): add the phone layout and bottom sheet`. PR body: `Part of #40`. If the touch change makes #82 moot, say so in the PR.

### Task M6.T5: Accessibility pass (new issue)

**Files:**
- Create: `web/e2e/a11y.spec.ts`, `web/src/hooks/usePageTitle.ts` (+ test), `web/src/hooks/useRouteFocus.ts` (+ test)
- Modify: `web/package.json`, `web/package-lock.json`, `web/src/App.tsx` (+ test), `web/src/explorer/Explorer.tsx`, `web/src/pages/Methodology.tsx`, `web/src/pages/About.tsx`, `web/src/styles.css`, plus any component axe flags

**Interfaces:**
- Consumes: the `mobile` project and the `a11y.spec.ts` match from T4; the page headings from T1 and T2.
- Produces:
  - `usePageTitle(title: string): void`, which sets `document.title`. Each route calls it with the exact titles in Global Constraints.
  - `useRouteFocus(): void`, called in `App`. When `pathname` changes after the first render and there's no hash, it focuses `[data-page-heading]`. The Explorer's indicator title, the Methodology `<h2>` and the About `<h2>` get `data-page-heading` (the Explorer keeps its other focus rules).
  - `App` markup: `<header className="site-header">` holds the `<h1>` and `<nav aria-label="Primary">` with `NavLink`s; `<main>` holds only `<Routes>`.

- [ ] **Step 1:** `npm install --save-dev --save-exact @axe-core/playwright@<latest published at least two weeks ago>`.
- [ ] **Step 2: Write failing tests.**
  - `usePageTitle.test.tsx`, plus `App.test.tsx`: each route sets its exact title; the header contains the `<h1>` and nav, and `main` contains neither; the active `NavLink` has `aria-current="page"`; clicking "About" from the Explorer focuses the About heading; `/methodology#legacy` doesn't steal focus from the hash target.
  - `a11y.spec.ts`: one `test` per state in spec §6.1 (values map; model map; table view; panel open; picker open on `mobile` only, skipped on `chromium`; `/methodology`; `/about`). Each runs `new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()`, attaches the full results as JSON to the test, and expects no violation with `impact` `serious` or `critical` (the message lists rule ids and targets).
- [ ] **Step 3:** Run the unit tests and e2e; record the axe failures.
- [ ] **Step 4: Implement** the hooks and landmark changes, and one `:focus-visible` outline (`2px solid` in the site's text colour, `outline-offset: 2px`). Fix each serious or critical axe finding at its source. Colour changes must keep the M5 tier colours exactly; if a tier swatch fails contrast, fix the swatch border or label, not the fill.
- [ ] **Step 5:** Run the web checks and e2e on both projects; all pass.
- [ ] **Step 6:** Do the manual checklist (spec §6.3) and paste the results into the PR body. File a `type:bug` issue for anything not fixed here.
- [ ] **Step 7:** Commit: `feat(web): accessibility pass with axe checks`. PR body: `Part of #<T5>`, listing moderate and minor axe findings.

### Task M6.T3: README and screenshot (#39)

**Files:**
- Create: `web/scripts/screenshot.mjs`, `docs/images/explorer.png`
- Modify: `README.md`, `web/package.json`; `docs/superpowers/specs/2026-11-11-m6-methodology-polish-design.md` §4.3 (the script name)

**Interfaces:**
- Consumes: the finished UI from T1–T5.
- Produces: `npm run screenshot` → `node scripts/screenshot.mjs`. It starts `vite preview` on port 4174, waits for it, opens `./?mode=model&c=53033` at 1280×800 with Playwright's `chromium`, waits for the model card heading, writes `../docs/images/explorer.png`, and always stops the server. It's a `.mjs` file rather than `.ts`, like `gen-types.mjs`, so it needs no TypeScript runner. Record this in the spec.

- [ ] **Step 1:** Write the script; run `npm run build && npm run screenshot`; open the PNG and check it shows the map, legend and model card.
- [ ] **Step 2:** Write the README to spec §4.2. Badges: `https://github.com/edward-sf/pnw-health-dashboard/actions/workflows/ci.yml/badge.svg`, the same for `build-deploy.yml`, and an MIT badge linking to `LICENSE`. The Mermaid block is a `flowchart LR` of the stages in spec §4.2 item 4. Keep the existing pipeline instructions under "Run it locally".
- [ ] **Step 3:** Push the branch and check on GitHub that the README renders, with the diagram drawn, the image shown and every link resolving.
- [ ] **Step 4:** Commit: `docs: rewrite the README with screenshot and architecture`. PR body: `Part of #39`.

### Milestone PR

- [ ] Fill in the milestone template with every issue PR and `Closes #37`, `#38`, `#39`, `#40`, `#<T5>`. Evidence: web checks; the e2e run on both projects; the axe summary (zero serious or critical, plus a list of moderate and minor findings); the manual checklist; screenshots of `/methodology` and of the bottom sheet in peek and expanded on the mobile project; the README as rendered on GitHub. Then mark it ready for review.
