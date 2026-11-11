# M2 Map + Live Site — Design

**Date:** 2026-11-10
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§6 Website, §7 Testing, §8 CI/CD). This document records the decisions M2 adds; where it is silent, the parent spec applies.

## 1. Outcome

A React site shows a choropleth of any M1 indicator across all 149 counties, with Alaska as an inset, and CI deploys it to GitHub Pages.

**Exit criteria:**
- The public URL is live at `https://edward-sf.github.io/pnw-health-dashboard/`.
- `ci` is a required check on `main`.
- `build-deploy` is proven on the milestone branch before merge and by a manual run on `main` after merge, and the monthly cron is configured.

**Deferred from the parent spec's Explorer:**

| Feature | Arrives in | M2 behavior |
|---|---|---|
| County panel | M3 | Clicking a county sets `c` and outlines it |
| Table view | M3 | `view=table` is treated as a bad param |
| Keyboard path to every county | M3 (table and search) | Map is pointer-only |
| Model mode, `model.json` | M4, M5 | `mode=model` is treated as a bad param; `useData()` loads three files |
| Methodology and About content | M6 | Stub pages |

## 2. Web app

Vite, React, TypeScript and React Router in `web/`, with Node 26 pinned in `web/.nvmrc`.

### Types
`npm run gen:types` runs `json-schema-to-typescript` over `schema/*.json` and writes to `web/src/types/generated/`, which is git-ignored. It runs before typecheck, test and build, but only `tsc` catches contract drift (`vite build` and Vitest do not typecheck), so drift fails `npm run typecheck`, which `ci` requires. `counties.topojson` is not covered by the schema; it uses `@types/topojson-specification` plus a hand-written properties type `{fips, name, state}`.

### Data loading
`useData()` fetches `manifest.json`, `values.json` and `counties.topojson` once, under `import.meta.env.BASE_URL`, and returns `loading`, `error` (with `retry`) or `ready`. A failed fetch, or a `schema_version` whose major version is not `1`, gives `error`, which renders the full-page error with retry.

### Map
Two independent projections, each fitted with `fitExtent` to its own rectangle of a fixed SVG `viewBox` and drawn in its own `<g>`:
- **WA/OR/ID:** `geoConicEqualArea`, parallels `[43, 48]`, rotate `[118, 0]`.
- **Alaska:** `geoConicEqualArea`, parallels `[55, 65]`, rotate `[154, 0]`. The rotation keeps Aleutians West together across the antimeridian.

A single multiplexed projection like `geoAlbersUsa` was rejected: it only pays off when screen points must be inverted to coordinates, which this map never does.

Alaska sits in a bordered inset to the left of the three states, over the Pacific, labeled "Alaska (not to scale)". `buildMapPaths(features, layout)` is a pure function returning one `{fips, d}` per county. Each county is a `<path data-fips>`. Hover shows a tooltip with the county name, state and formatted value. Click selects the county.

### Color and legend
`makeColorScale(indicator, values)` is a pure function:
- Five quantile bins (`d3.scaleQuantile`) over the non-null values of the 149 counties.
- **Directional indicators:** darker always means worse, using `schemeOrRd[5]`. `higher_is_better` reverses the ramp.
- **Neutral indicators:** `schemeBlues[5]`, darker means higher.
- **Null values** (suppressed, missing, or legacy-only) use an SVG hatch pattern.

The legend shows actual bin bounds formatted by unit, collapses empty bins caused by ties, labels directional ends "Better" and "Worse", and has a hatch entry "Suppressed or not available".

### URL state
`parseParams(search, manifest, fipsSet)` is a pure function returning `{indicator, county, mode, view, invalid}`. It validates `i` against the catalog and `c` against the county set; `mode` accepts only `values` and `view` only `map` in M2. Params listed in `invalid` are removed from the URL with a history replace. With no valid `i`, the first catalog indicator is shown without writing it to the URL. User selections push a history entry.

### Indicator picker
A text filter above a list grouped by category, built by hand: a native `<select>` cannot be searched, and the list is too small to justify a library. Options are native buttons with `aria-pressed`, so the picker works by keyboard.

### Routing
`BrowserRouter` with `basename` from `import.meta.env.BASE_URL`, and Vite `base: '/pnw-health-dashboard/'`. Routes are `/`, `/methodology` and `/about`. `public/404.html` encodes the requested path into a query param and redirects to the app root. A small script in `index.html` restores it with `history.replaceState` before React mounts, with the encode and decode logic unit-tested.

## 3. CI/CD

### `ci.yml`
Runs on PRs into, and pushes to, `main` and `milestone/**`. Fetches no real data.
- `pipeline` job: ruff check, ruff format check, mypy, pytest.
- `web` job: type generation, ESLint, `tsc --noEmit`, Vitest.
- `ci` job: depends on both, giving branch protection one stable check name.

### `build-deploy.yml`
Runs on pushes to `main` and `milestone/**`, the monthly cron, and manual dispatch. One concurrency group, without cancelling a run in progress.
- `build` job: `pnw-health run` using the `CENSUS_API_KEY` secret, with `data/raw` cached on `hashFiles` of `pipeline/src/pnw_health/config.py` and `pipeline/src/pnw_health/indicators.yaml`; then site build, Playwright smoke test against `vite preview`, and Pages artifact upload.
- `deploy` job: needs `build`, runs only when `github.ref == 'refs/heads/main'`, and is the only job granted `pages: write` and `id-token: write`. The `github-pages` environment already restricts deploys to `main`.

Any failure means no deploy, so the last good site stays live.

**Why milestone pushes run it:** GitHub only runs scheduled workflows from the default branch and only allows dispatch once the file is on it. Running `build` on milestone pushes proves everything except the publish step before the author approves the merge.

**Known limit:** GitHub disables scheduled workflows on public repos after 60 days without repository activity, and the cron's own runs do not count. A quiet repo stops refreshing until the workflow is re-enabled; the site stays up.

### Branch protection on `main`
Require a pull request and a passing `ci` check, apply to admins, and require zero approvals, since GitHub does not let an author approve their own PR. Applied when M2.T7 lands.

## 4. Task order

Issue IDs stay as they are; M2.T7 moves up so every later issue PR is checked, as `CONTRIBUTING.md` requires from M2 onward:

T1 scaffold → T7 CI and branch protection → T2 data → T3 map → T4 color and legend → T5 picker and URL state → T6 routing → T8 build and deploy.

## 5. Testing

- **Vitest and Testing Library** against a small committed synthetic fixture in `web/src/test/fixtures/`, including a null value, a legacy-only county, a neutral indicator and tied values. Tests never need real exports.
- **Unit coverage:** `parseParams`, `makeColorScale` (direction, neutral, ties, nulls), `buildMapPaths` (one path per county, finite coordinates, Aleutians West within the inset), `useData()` states, legend rendering, picker filtering, and the 404 redirect encode and decode.
- **Playwright smoke test** against the production build: load → 149 county paths present → pick an indicator → click a county → `i` and `c` in the URL. The parent spec's panel and model-mode steps join in M3 and M5.

## 6. Documentation changes in M2

- Parent spec §8: triggers updated to match §3 above.
- `docs/milestone-review-template.md`: M2 checks split into before-merge and after-merge.
- Roadmap M2 exit line: updated to match §1 above when the M2 plan is written.
