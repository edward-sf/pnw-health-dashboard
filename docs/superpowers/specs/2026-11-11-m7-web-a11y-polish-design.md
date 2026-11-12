# M7 Web a11y + Polish Follow-ups — Design

**Date:** 2026-11-11
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§6 Website). M6 decisions this builds on are in `2026-11-11-m6-methodology-polish-design.md`. This document records only what M7 decides; where it is silent, those specs apply.

## 1. Outcome

The live site has no known accessibility bugs, and the web code carries no open review debt from M2–M6.

**Exit criteria:**
- Every county's outline is at least 3:1 against its own fill, for every fill the map can draw (both ramps, every tier, the hatch), as §3.1 specifies; a unit test checks each one.
- After a route change made while the data is still loading (for example a cold-load redirect from an unknown path), focus lands on the Explorer heading once it renders; a unit test covers it.
- A skip link reaches the county search in one Tab and one Enter from the top of the Explorer; covered by a unit test and `e2e/a11y.spec.ts`.
- In model mode the county panel's first section is the model card, and every other item in #130 is done.
- `SortHeader`, `CountyCell` and `HatchSwatch` are shared components, and the existing `CountyTable`, `ModelTable`, `Legend` and `ModelLegend` tests pass without changes to their assertions.
- A Playwright spec against a server that returns real 404 responses reloads `/methodology` with a query and hash and gets the full URL back.
- `npm audit` in `web/` reports 0 findings, or each remaining one is recorded on #83 as accepted with a reason.
- axe still reports no serious or critical violations on both Playwright projects.
- `ci` and `build-deploy` are green on `milestone/m7`. PR `ci` skips Playwright, so E2E runs locally with `CI=1` before each issue PR that touches it.

**Scope.** The eight roadmap issues: #138, #139, #98, #82, #130, #129, #81, #83. Web only: no pipeline, export-contract or `schema/` changes, and no files shared with M8, so the two milestones can run in parallel. New problems found along the way get their own issue in Backlog unless they block M7.

## 2. Spec changes

Each is made in the same PR as the code it describes.

| Spec | Section | Change | PR |
|---|---|---|---|
| Parent spec | §6 Explorer, county panel | The listed order applies in values mode. In model mode the model card comes first, then the indicator section (value, ranks, strip plot), then "Who lives here". | #130 |
| M6 design | Accessibility (§6) | County boundaries are required graphics under WCAG 1.4.11. Each county's outline is at least 3:1 against its own fill (§3.1). | #138 |

## 3. Per-issue design

Work order: §3.1 → §3.7, i.e. #138, #139, #98, #130, #129, #81, #83. The accessibility bugs go first. #130 lands before #129 so its panel and table test changes are in place before the extraction moves that code.

### 3.1 #138 County outline contrast

**Decision:** county boundaries are required graphics under WCAG 1.4.11. They are what separates a pale county from the page and from a pale neighbour.

**Change:** the outline depends on the county's fill, so it is at least 3:1 against every fill the map draws. `outlineFor(fill)` in `web/src/color/outline.ts` returns the grey default `#808080` when that reaches 3:1 against the fill, and otherwise black or white, whichever contrasts more. The hatch fill is judged by its `#f2f2f2` background. `CountyMap` sets it on each path as the `--county-stroke` custom property, and `.county { stroke: var(--county-stroke, #808080) }` uses it, so the hover/focus rule (`#333`, width 1) and the selected rule (`#000`, width 2) still win. Stroke width and every fill, including the M5 tier fills, stay as they are.

| Fills | Outline | Ratio against the fill |
|---|---|---|
| Lightest bins (`#fef0d9`, `#eff3ff`), `none` tier `#e3e3e3`, hatch `#f2f2f2` | `#808080` | 3.08–3.56 |
| Values bins 1–3, neutral bins 1–3, `somewhat_worse` `#f4a582`, `somewhat_better` `#92c5de` | `#000000` | 5.06–14.18 |
| Darkest bins (`#b30000`, `#08519c`), `notably_worse` `#ca0020`, `notably_better` `#0571b0` | `#ffffff` | 5.26–7.87 |

`#808080` is also 3.95:1 against the white page, so a pale county's outline separates it from the page too.

**Why not one colour:** no single colour reaches 3:1 against the whole ramp. A first version used `#808080` everywhere. Against bin 3 of each ramp that is 1.00:1 (`#e34a33`) and 1.05:1 (`#3182bd`), worse than the old `#b8b8b8` (about 2:1), so neighbouring counties in those bins lost their boundary. The M7 whole-branch review caught it, and the fill-aware outline replaced it.

**Trade-off:** mid-ramp counties get thin black outlines, close in colour to the `#333` hover outline. Hover stays distinct by width (1 vs 0.5), and the selected county by width (2).

**Test:** `outlineContrast.test.ts` (with the `contrastRatio` helper in `web/src/color/contrast.ts`) checks that `outlineFor(fill)` is at least 3:1 against every colour in both 5-bin ramps and every tier fill, taken from their sources (`tierFill`, the d3 schemes), and against the hatch background. It checks that pale fills keep `#808080`, and that the `.county` rule's fallback in `styles.css` equals it. `CountyMap.test.tsx` checks that each path carries `outlineFor` of its fill.

### 3.2 #139 Route focus after a late heading

`useRouteFocus` (`web/src/hooks/useRouteFocus.ts`) keeps its current rules: no move on first render, none when the URL has a hash, none on search-only changes. One change: if no `[data-page-heading]` exists when the pathname changes, it starts a `MutationObserver` on `document.body` (`childList`, `subtree`). When the heading appears, the hook focuses it and disconnects. The observer also disconnects on the next pathname change and on unmount, so a stale wait can't move focus later.

**Test:** in `useRouteFocus.test.tsx`, a route whose heading renders only after a state change (standing in for data load). Navigate to it, then trigger the render, and expect the heading to have focus. A second test navigates away before the heading renders and expects focus not to move.

### 3.3 #98 Skip link to the county search

A "Skip to county search" link is the Explorer's first focusable element, before the indicator picker. It is visually hidden until it has focus, using the M6 `:focus-visible` style. Activating it moves focus to the county search input. That input is present in map and table views and in both modes, so the link is always valid.

**Tests:** a unit test (Tab once and the link has focus; Enter moves focus to the search input) and a keyboard step in `e2e/a11y.spec.ts`.

### 3.4 #130 Model UI test and polish follow-ups

- **Card placement:** in model mode the county panel renders the model card first, then the indicator section, then "Who lives here". Values mode is unchanged. On a phone the card is what shows in the bottom sheet's peek state. The parent-spec change in §2 goes in this PR.
- **The rest of #130, as listed there:** exercise the `focusFips` binding and the Back-to-the-same-county case in `Explorer.test.tsx`; check the smoke test's final URL exactly and make its goBack waits positive; fix the `sortModelRows` null-ordering test (add a second null row); add a `ModelTable` test with a negative and a near-zero difference (U+2212, no sign at zero); make `formatSigned` default to `formatBound`'s per-unit digits instead of a fixed 1, keeping today's output for the life-expectancy callers; and the cosmetic items (duplicate import, formatting, memoize `tierCounts`).

### 3.5 #129 Shared table and legend components

Extract from `CountyTable` and `ModelTable`:
- `SortHeader`: the sortable column header with `aria-sort` and the toggle rule.
- `CountyCell`: the county-name button cell that selects the county.

Extract from `Legend` and `ModelLegend`:
- `HatchSwatch`: the hatch `<pattern>` swatch for null values.

Behavior stays the same. The existing tests for the four components pass without changes to their assertions, and each new component gets its own small test.

### 3.6 #81 Real 404 deep-link test

`vite preview` falls back to `index.html`, so it never serves `public/404.html`. A small static server in `web/e2e/` (Node `http` and `fs`, no new dependency) mimics GitHub Pages: it serves `dist/` under `/pnw-health-dashboard/` and answers unknown paths with status 404 and the body of `404.html`. A new Playwright spec, with its own `webServer` entry or project, loads `/pnw-health-dashboard/methodology?i=poverty_rate#sources`, and asserts that the page shows the Methodology page and that the URL's path, query and hash are exactly what was requested.

### 3.7 #83 Dev-only npm audit findings

Clear findings with in-range or minor updates first. A finding that needs a major-version jump is either fixed (if the jump is cheap and tests pass) or recorded on #83 with the package, the advisory and why it is accepted (dev-only, not shipped in `dist/`). `npm audit --omit=dev` must stay at 0.

### 3.8 #82 Tooltip clipping at phone width

No code. Since M6, a tap on a touch device selects the county and opens the panel without showing a tooltip (`CountyMap.tsx`), and `e2e/mobile.spec.ts` asserts there is none. That meets the issue's second done-when. The milestone PR closes #82 with that note.

## 4. Testing

Unit tests (Vitest) for §3.1–§3.5. Playwright for §3.3 (the a11y spec), §3.4 (the smoke test's URL checks) and §3.6, on the projects those specs already target. axe runs as in M6. The milestone PR records `npm test`, `lint`, `typecheck`, a local `CI=1` Playwright run and the `build-deploy` run on `milestone/m7`.
