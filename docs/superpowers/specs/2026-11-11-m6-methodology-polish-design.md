# M6 Methodology + Polish — Design

**Date:** 2026-11-11
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§3 Data sources and harmonization, §5 Machine learning, §6 Website, §7 Testing). The export contracts are in that spec §4 and in `2026-11-10-m4-ml-pipeline-design.md` §5. This document records the decisions M6 adds; where it is silent, the parent spec applies.

## 1. Outcome

The site and repo are ready for a reader who arrives cold. The methodology page explains, with numbers from the exports, how every value and model result was made. The About page and README say what the project is and who built it. The Explorer works on a phone and passes an automated WCAG 2.1 AA check. No pipeline or contract changes.

**Readers.** Two kinds, served in layers: portfolio reviewers who skim (the "At a glance" summary, the README) and public-health readers who want full detail (the anchored methodology sections).

**Exit criteria:**
- Every number, list and vintage on the methodology page is rendered from `manifest.json` or `model.json`; none is typed into the copy.
- Each "Methodology" link in the county panel lands on the matching anchor (§3.4).
- On the `mobile` Playwright project, a tapped county opens the bottom sheet in peek; it expands, collapses and closes.
- axe reports no serious or critical violations on any audited state (§6.1), on both Playwright projects.
- The README renders on GitHub with its badges, Mermaid diagram and screenshot.
- `ci` and `build-deploy` are green on `milestone/m6`.

**Scope.** M6 covers the roadmap's four issues (#37–#40), with #40 split in two (§7). Open backlog issues stay in the backlog, including #82 (tooltip clipping at phone width), #98 (skip link to the county search), #129 and #130. If M6 work makes one of them moot, the PR says so; it doesn't close them.

**Deferred:**

| Feature | Arrives in | M6 behavior |
|---|---|---|
| Visible skip link to the county search | #98 (backlog) | The `<main>` landmark gives screen-reader users a jump target; no visible skip link |
| Draggable bottom sheet with snap points | Not planned | Button-driven peek/expanded heights |

## 2. Data used

All already exported and loaded by `loadData` since M5; M6 adds no fetches.

| Field | Used for |
|---|---|
| `manifest.sources` | Sources table: `source`, `year`, `url` (ACS 2024, PLACES 2025, CHR 2025, CHR legacy 2023, boundaries 2024 in the current export) |
| `manifest.indicators` | Indicator catalog; labels and units for model features; `ci_level` in the missing-data section |
| `manifest.built_at` | Reproducibility section |
| `model.metrics` | Ridge vs LightGBM, national and PNW: `rmse`, `mae`, `r2`, `n` |
| `model.behaviors_comparison` | Main vs behaviors model on the same counties; `excluded_states` |
| `model.global_importance` | Ranked mean absolute SHAP per feature |
| `model.thresholds` | `sigma_model`, `z_75`, `z_90` for the tier explanation |
| `model.model_card` | Target, features, training-county count, excluded counties and feature groups, folds, seed, LightGBM params and version |

`excluded_states` holds national state FIPS codes (currently 21 and 42), and the web code only maps the four PNW state abbreviations to names. M6 adds a small `stateFipsNames` module (50 states, DC and Puerto Rico) for these rows; a FIPS not in it is shown as-is.

## 3. Methodology page (`/methodology`)

### 3.1 Loading

`Methodology` takes the `AppData` from the `useData()` call that `App` already makes. While loading it shows the same "Loading data…" line as the Explorer; on error, the same `ErrorPage` with retry. All prose is written in TSX; every number, list, label and vintage comes from the data in §2. Feature ids are shown by their manifest label.

### 3.2 Layout

An **At a glance** box, then an in-page table of contents, then these sections. All sections are always visible; nothing is collapsed.

| Anchor | Heading | Content |
|---|---|---|
| — | At a glance | 4–5 sentences: 149 counties in four states, from CDC, Census and County Health Rankings data; the model predicts life expectancy from 9 social and economic factors; its cross-validated R² for the PNW and nationally, with a plain statement that it explains the national pattern better than the PNW; the top 3 factors by global importance; the factors are associations, not causes. |
| `#sources` | Sources and vintages | Table: source name, vintage, link, what it's used for. One line on why CDC WONDER isn't used (its API doesn't support sub-national queries). |
| `#indicators` | Indicators | The catalog grouped by category: label, source and year, direction ("higher is better", "higher is worse", "no direction"), description. |
| `#harmonization` | Geography | 2020 Census FIPS. Wade Hampton → Kusilvak remap. Sub-anchor `#legacy`: the Valdez-Cordova split into Chugach and Copper River, why successor values stay empty, what the legacy value is, and that legacy values are left out of ranks and model training. |
| `#missing-data` | Missing and uncertain values | Sub-anchor `#suppression`: suppressed or missing values stay empty and are never filled in; how the map and table show them. Sub-anchor `#unreliable`: values the source marks unreliable keep their value and rank and carry a flag. Confidence intervals: ACS margins at the `ci_level` in the manifest (90%), other sources' published intervals. |
| `#model` | The life expectancy model | Target and features (labels). Trained on `training_counties` US counties; `n_folds`-fold cross-validation grouped by state. Metrics table (Ridge baseline vs LightGBM; national and PNW; R², RMSE, MAE, n). Global importance as a ranked list. Tiers: how `sigma_model`, `z_75` and `z_90` set "somewhat" and "notably" better or worse. Why some counties have no result (no reported life expectancy). Proxy features, expanding the panel's proxy note. Associations vs causes. |
| `#exclusions` | What the model leaves out | Excluded feature groups with their reasons. "How much do behaviors add?": main vs behaviors model on the same counties (R², RMSE; national and PNW), the states left out of that comparison and why, and that only its metrics are used — never its predictions or SHAP values. Excluded counties grouped by reason, e.g. "8 Connecticut counties: {reason}". |
| `#model-card` | Reproducibility | Seed, folds, LightGBM version and parameters (definition list), export build date. |

### 3.3 Components

Under `web/src/pages/methodology/`, one file per section: `AtAGlance`, `SourcesSection`, `IndicatorCatalog`, `HarmonizationSection`, `MissingDataSection`, `ModelSection`, `ExclusionsSection`, `ReproducibilitySection`, plus `MetricsTable` (shared by the model and exclusions sections). `Methodology.tsx` composes them and the table of contents.

### 3.4 Deep links

| Panel text | Link |
|---|---|
| Unreliable estimate note | `/methodology#unreliable` |
| "Suppressed or not available" | `/methodology#suppression` |
| Valdez-Cordova legacy value | `/methodology#legacy` |
| Model card, no result | `/methodology#no-result` |

On the methodology page, a hash in the URL (on load or on navigation) scrolls to the matching section and moves focus to its heading. A hash that matches no section is ignored.

### 3.5 Formatting and wording

- R², RMSE and MAE: 2 decimals. Years of life expectancy: 1 decimal. Counts: integers with thousands separators.
- M5's wording rules apply: factors are "associated with" the expected value; never "cause", "drive" or "explain the difference".

## 4. About page and README

### 4.1 About page (`/about`)

Static content with no data dependency, so it renders even if the data fails to load.
- **What this is:** 2–3 sentences on the explorer and the life expectancy model.
- **How to use it:** values vs model mode, map vs table, county search; link to the methodology page.
- **Built with:** Python (uv, pandas, LightGBM, SHAP), React, Vite, d3-geo, Observable Plot; data rebuilt and deployed by GitHub Actions to GitHub Pages.
- **Data credits:** CDC PLACES, County Health Rankings & Roadmaps, Census ACS, Census cartographic boundary files, with links; a line saying the site isn't affiliated with or endorsed by them.
- **Author:** Edward Simpson-Fitzgibbon, with GitHub and LinkedIn links (the LinkedIn URL is supplied by the author when M6.T2 is implemented); link to the repo and the MIT license.

### 4.2 README

Replaces the current README and keeps its pipeline instructions.
1. Title, one-line description, badges: CI, Build and deploy, MIT license.
2. Live site link (`https://edward-sf.github.io/pnw-health-dashboard/`) and the screenshot.
3. What it does: explorer, model mode, methodology (link to the page for caveats).
4. Architecture: a Mermaid flowchart (sources → fetch, cached → harmonize → model → export of 4 files → Vite build → GitHub Pages), with one line per stage on what it guarantees.
5. Repo layout: `pipeline/`, `web/`, `schema/`, `docs/`.
6. Run it locally: pipeline, web (`npm ci && npm run dev`), tests.
7. Development: link to CONTRIBUTING and the specs.
8. License and data credits.

### 4.3 Screenshot

`web/scripts/screenshot.mjs`, run as `npm run screenshot`, builds the site, then uses Playwright against `vite preview` of it at a fixed 1280×800 desktop viewport. It captures model mode with one county selected, so the image shows the map, legend and model card. It is an `.mjs` file, like `gen-types.mjs`, so it needs no TypeScript runner. Output: `docs/images/explorer.png`, committed. CI doesn't run it; it's rerun by hand after data or UI changes.

## 5. Mobile layout (≤720px)

Tablet (721–1099px) and desktop layouts don't change.

### 5.1 Bottom sheet

- A `useMediaQuery("(max-width: 720px)")` hook switches `CountyPanel` into sheet mode: fixed to the bottom of the viewport above the map, rounded top corners, a decorative handle bar.
- Two heights, both scrollable: **peek** (about 40dvh: name, state, the selected value or tier and the rank visible without scrolling) and **expanded** (about 85dvh). Because both heights scroll, no content is clipped or hidden from assistive technology.
- Header buttons: **Expand**/**Collapse** (`aria-expanded`, `aria-controls` pointing at the sheet body) and **Close**. Escape closes, as today.
- Height is local UI state, not URL state. Selecting a different county resets it to peek; the county stays in `?c=`.
- Non-modal: no focus trap, and the map stays tappable in peek. Focus behavior is unchanged: opening from the table or search focuses the heading; closing returns focus to the opener.
- While a sheet is open, the map area gets bottom padding equal to the peek height so counties near the bottom of the map stay tappable.
- The height transition is disabled under `prefers-reduced-motion: reduce`.

### 5.2 Touch

Map hover handlers move from `onMouse*` to `onPointer*` and ignore `pointerType === "touch"`. On touch, a tap selects the county and opens the sheet, which replaces the tooltip. Mouse hover is unchanged.

### 5.3 Indicator picker

On phones the picker collapses into a disclosure button, "Indicator: {current label}" (`aria-expanded`). Opening it shows the existing search box and list; choosing an indicator closes it and returns focus to the button. Desktop and tablet are unchanged.

### 5.4 Touch targets

On phones, buttons, toggles and table sort headers are at least 44×44 CSS px (above the 24px WCAG 2.5.8 AA minimum).

## 6. Accessibility

Target: WCAG 2.1 AA.

### 6.1 Automated check

Add `@axe-core/playwright` (dev dependency) and `web/e2e/a11y.spec.ts`. It runs axe with the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags on both Playwright projects, in these states:
- Explorer: values map; model map; table view; county panel (sheet on mobile) open; picker disclosure open (mobile only).
- `/methodology`; `/about`.

Serious or critical violations fail the test. Moderate and minor ones are attached to the test report and listed in the milestone PR.

### 6.2 Known fixes

- **Landmarks:** the site `<h1>` and primary `<nav>` move out of `<main>` into a `<header>`; `<main>` holds only the route content.
- **Current page:** nav links become `NavLink`, so the active one has `aria-current="page"`.
- **Page titles:** a `usePageTitle` hook sets `document.title` per route: "PNW Health Dashboard" for the Explorer, "Methodology · PNW Health Dashboard", "About · PNW Health Dashboard".
- **Route focus:** navigating between pages moves focus to the new page's `<h2>` (the Explorer keeps its existing focus rules). The initial page load doesn't move focus.
- **Focus visibility:** one consistent `:focus-visible` outline for all interactive elements.
- **Contrast:** fix whatever axe flags (likely candidates: the dimmed picker, legend text, the hatch swatch).

### 6.3 Manual checklist

Recorded in the milestone PR: full keyboard-only flow; VoiceOver on macOS Safari and in the iOS Simulator; 200% zoom; reflow at 320px width; reduced motion. Problems too large to fix in M6 get a `type:bug` issue.

## 7. Tasks

The roadmap's M6.T4 is split; #40 is narrowed to mobile and a new issue is opened for accessibility. Order of work:

| Order | Task | Issue |
|---|---|---|
| 1 | M6.T1 Methodology page (§3, including deep links) | #37 |
| 2 | M6.T2 About page (§4.1) | #38 |
| 3 | M6.T4 Mobile layout: bottom sheet, touch, picker disclosure, touch targets, `mobile` Playwright project (§5) | #40 |
| 4 | M6.T5 Accessibility pass: axe spec, landmarks, titles, focus, contrast fixes, manual checklist (§6) | new |
| 5 | M6.T3 README and screenshot (§4.2–4.3), last so the screenshot shows the finished UI | #39 |

## 8. Testing

- **Unit (Vitest):** each methodology section renders the right numbers from fixture data (including a feature id mapped to its label, an unknown excluded-state FIPS shown as-is, and the excluded-counties grouping); hash scroll and focus; panel links point at the §3.4 anchors; About renders without data; sheet mode with `matchMedia` mocked (peek/expand, reset on county change, Escape, focus return); touch pointer events show no tooltip; picker disclosure open/close and focus return; `usePageTitle`; route focus.
- **Playwright:** a second project, `mobile` (Pixel 7 device profile, touch), runs a new `e2e/mobile.spec.ts`: tap a county, check the peek sheet, expand, collapse, close, and open and use the picker disclosure. The existing `smoke.spec.ts` stays desktop-only (it relies on hover) and gains a test that `/methodology` and `/about` render their headings. `a11y.spec.ts` runs on both projects.

## 9. Documentation changes in M6

- Roadmap: M6 lists T1–T5 with the split described in §7.
- Parent spec §6: the county panel's mobile behavior points at §5 of this document.
- README rewritten (§4.2).
