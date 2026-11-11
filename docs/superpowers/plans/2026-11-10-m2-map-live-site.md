# M2 Map + Live Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is one GitHub Issue (`M2.T<k>`) and one issue PR into `milestone/m2`. The milestone ends with a single milestone PR `milestone/m2 → main` for the author to review. Follow `CONTRIBUTING.md` for branch, PR, and merge rules. A task's final "Commit" step is followed by its issue PR. Tasks run in the order written here, which is not numeric: **T7 runs second.**

**Goal:** A React site shows a choropleth of any M1 indicator across all 149 counties, with Alaska as an inset, and CI deploys it to GitHub Pages.

**Architecture:** A Vite + React + TypeScript app in `web/` reads only the exported files in `web/public/data/`. Pure functions own the logic (`parseParams`, `makeColorScale`, `buildMapPaths`), and thin React components render their results. `ci.yml` gates PRs with no real data; `build-deploy.yml` runs the real pipeline, builds, smoke-tests, and publishes from `main` only.

**Tech Stack:** Node 26, Vite 8, React 19, TypeScript 6.0, React Router 8, d3-geo, d3-scale, d3-scale-chromatic, topojson-client; Vitest 5, Testing Library, Playwright, ESLint 10.

**Spec:** `docs/superpowers/specs/2026-11-10-m2-map-live-site-design.md`, with parent `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md` (§6, §7, §8). **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`.

## Global Constraints

- Node 26 pinned in `web/.nvmrc`. `web/package-lock.json` is committed.
- **TypeScript stays on `~6.0.3`.** `typescript-eslint` 8.72 requires `typescript <6.1.0`; the latest TypeScript (7.0) is outside its range.
- Import from `react-router`, not `react-router-dom` (which stopped at 7.x).
- FIPS codes are always 5-character zero-padded **strings**. Never parse them as numbers.
- Null is not zero. Test for `v === null`, never falsiness, and use `??`, never `||`, on values.
- Site base path is `/pnw-health-dashboard/`. Every asset and fetch URL goes through `import.meta.env.BASE_URL`.
- Supported `schema_version` major: `1`.
- Tests never touch the network and never read `web/public/data/`; they use `web/src/test/fixtures/`.
- `web/public/data/` is git-ignored and is never committed.
- The root `.gitignore` is a Python template: `lib/`, `build/`, `dist/`, `env/`, `var/`, `parts/` and `downloads/` match at any depth. Do not create source directories with those names under `web/`.
- GitHub Actions are pinned to these release tags: `actions/checkout@v7.0.1`, `actions/setup-node@v7.1.0`, `actions/cache@v6.1.0`, `astral-sh/setup-uv@v10.3.3`, `actions/upload-pages-artifact@v5.0.0`, `actions/deploy-pages@v5.0.1`.

## Review Focus

1. **Root-relative URLs.** A fetch of `/data/values.json` works on the dev server and 404s on Pages under `/pnw-health-dashboard/`. *(Test in T2.)*
2. **Zero treated as missing.** A county with a true `0%` must get a color and a value, not the hatch. *(Tests in T4.)*
3. **Partial bad URLs.** `?i=bogus&c=53033` must clear only `i` and keep the county, and clearing must not trap the Back button. *(Tests in T5.)*
4. **Aleutians across the antimeridian.** Aleutians West has parts at positive longitudes; they must land inside the inset, not stretch across the map. *(Test in T3.)*
5. **Deep links losing their query.** Reloading `/?i=poverty_rate&c=53033` or `/methodology` on Pages goes through `404.html` and must restore path, query and hash. *(Tests in T6.)*

---

### Milestone start (no issue)

- [ ] **Step 1:** Commit the M2 design, this plan, and the spec, checklist and roadmap amendments to `milestone/m2`: `docs: add M2 design and plan`.
- [ ] **Step 2:** Push `milestone/m2` and open the draft PR `milestone/m2 → main` using `.github/PULL_REQUEST_TEMPLATE/milestone.md`.
- [ ] **Step 3:** Update issues #11–18: replace each "Provisional" body with a link to its task here and its acceptance criteria. Move them to `Ready` on the board.

### Task M2.T1: Scaffold the web app (#11)

**Files:**
- Create: `web/.nvmrc`, `web/package.json`, `web/package-lock.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/eslint.config.js`, `web/index.html`, `web/scripts/gen-types.mjs`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/src/types/index.ts`, `web/src/test/setup.ts`, `web/src/App.test.tsx`
- Modify: `.gitignore` (add `web/node_modules/`, `web/src/types/generated/`, `web/playwright-report/`, `web/test-results/`, `*.tsbuildinfo`)

**Interfaces:**
- Produces npm scripts: `gen:types`, `dev`, `build` (`vite build`), `preview`, `test` (`vitest run`), `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), with `predev`, `pretest`, `pretypecheck` and `prebuild` all running `gen:types`.
- Produces `web/src/types/index.ts`, re-exporting `Manifest`, `Indicator`, `Unit`, `Direction` from `./generated/manifest` and `ValuesFile`, `ValueEntry` from `./generated/values`, plus:
  - `type CountyProperties = { fips: string; name: string; state: "WA" | "OR" | "ID" | "AK" }`
  - `type CountiesTopology = Topology<{ counties: GeometryCollection<CountyProperties> }>`
- `main.tsx` renders `<BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter>` in `StrictMode`.

- [ ] **Step 1:** Create `web/package.json` with dependencies `react@19.3.1 react-dom@19.3.1 react-router@8.5.1 d3-geo@3.1.2 d3-scale@4.0.3 d3-scale-chromatic@3.1.1 topojson-client@3.1.0` and dev dependencies `vite@8.3.7 @vitejs/plugin-react@6.3.0 typescript@~6.0.3 vitest@5.1.0 jsdom@31.0.0 @testing-library/react@16.3.3 @testing-library/dom@10 @testing-library/user-event@14.6.9 @testing-library/jest-dom@7.0.1 eslint@10.14.0 @eslint/js@10.0.1 typescript-eslint@8.72.2 eslint-plugin-react-hooks@7.1.1 globals@17.14.0 json-schema-to-typescript@16.0.0 @types/react@19.3.0 @types/react-dom@19.3.0 @types/d3-geo@3.1.1 @types/d3-scale@4.0.9 @types/d3-scale-chromatic@3.1.0 @types/topojson-client@3.1.5 @types/topojson-specification@1.0.5 @types/geojson@7946.0.16 @types/node`. Run `npm install` and commit the lockfile.
- [ ] **Step 2:** Configure `vite.config.ts` with `base: '/pnw-health-dashboard/'` and Vitest (`environment: 'jsdom'`, `setupFiles: './src/test/setup.ts'`). Use strict `tsconfig.json` with `noUncheckedIndexedAccess`. ESLint ignores `dist` and `src/types/generated`.
- [ ] **Step 3:** Implement `scripts/gen-types.mjs`: compile `../schema/manifest.schema.json` and `../schema/values.schema.json` with `json-schema-to-typescript` into `src/types/generated/manifest.ts` and `values.ts`.
- [ ] **Step 4: Write the failing test** in `src/App.test.tsx`: render `<App />` in a `MemoryRouter`; `expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PNW Health Dashboard")`.
- [ ] **Step 5:** Run `cd web && npm test`. Expected: FAIL (no `App`).
- [ ] **Step 6:** Implement `App.tsx`, `main.tsx`, `index.html`.
- [ ] **Step 7:** Run `npm test && npm run lint && npm run typecheck && npm run build`. Expected: all pass, and `src/types/generated/` contains exported `Manifest` and `ValuesFile`.
- [ ] **Step 8:** Commit: `chore(web): scaffold Vite React app with generated contract types`.

### Task M2.T7: `ci.yml` and branch protection (#17)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1:** Write `ci.yml`, triggered on `pull_request` and `push` for branches `main` and `milestone/**`, with `permissions: contents: read`.
  - Job `pipeline`, in `pipeline/`: `uv sync`, `uv run ruff check`, `uv run ruff format --check`, `uv run mypy src`, `uv run pytest`.
  - Job `web`, in `web/`: setup-node with `node-version-file: web/.nvmrc`, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`.
  - Job `ci`: `needs: [pipeline, web]`, `if: always()`, and fails unless both results are `success`. Without `if: always()`, a failed dependency makes this job *skipped*, which branch protection can treat as passing.
- [ ] **Step 2:** Commit: `ci: add pipeline and web checks`. Open the issue PR. Expected: `pipeline`, `web` and `ci` all pass on it.
- [ ] **Step 3:** Prove the gate: push a temporary commit with a failing web test to the PR. Expected: `web` and `ci` fail. Revert it. Expected: all pass.
- [ ] **Step 4:** Squash-merge per `CONTRIBUTING.md`.
- [ ] **Step 5:** Apply protection, as approved by the author in the design review:

```bash
gh api -X PUT repos/edward-sf/pnw-health-dashboard/branches/main/protection --input - <<'JSON'
{"required_status_checks":{"strict":false,"checks":[{"context":"ci"}]},
 "enforce_admins":true,
 "required_pull_request_reviews":{"required_approving_review_count":0},
 "restrictions":null}
JSON
```

- [ ] **Step 6:** Run `gh api repos/edward-sf/pnw-health-dashboard/branches/main/protection --jq '.required_status_checks.checks[].context, .enforce_admins.enabled'`. Expected: `ci` and `true`.

### Task M2.T2: `useData()` and error state (#12)

**Files:**
- Create: `web/src/data/loadData.ts`, `web/src/data/useData.ts`, `web/src/data/ErrorPage.tsx`, `web/src/data/loadData.test.ts`, `web/src/data/useData.test.tsx`, `web/src/test/fixtures/manifest.json`, `web/src/test/fixtures/values.json`, `web/src/test/fixtures/counties.topojson`, `web/src/test/fixtures/index.ts`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Produces:
  - `type AppData = { manifest: Manifest; values: ValuesFile; topology: CountiesTopology }`
  - `function loadData(baseUrl: string, signal?: AbortSignal): Promise<AppData>`, throwing `Error` on a non-OK response or unsupported schema major
  - `type DataState = { status: "loading" } | { status: "error"; message: string; retry: () => void } | { status: "ready"; data: AppData }`
  - `function useData(): DataState`
  - `ErrorPage` with props `{ message: string; onRetry: () => void }`
  - `fixtures/index.ts` exports typed `manifest: Manifest`, `values: ValuesFile`, `topology: CountiesTopology`, so fixture drift from the contract fails `tsc`.
- Fixture contents, hand-written and synthetic:
  - Counties: `53033` King WA, `41051` Multnomah OR, `16001` Ada ID, `02016` Aleutians West AK (two polygons, one at longitudes −176 to −175 and one at 178 to 179, clockwise rings), `02063` Chugach AK.
  - Indicators: `poverty_rate` (percent, higher_is_worse), `median_household_income` (dollars, higher_is_better), `pct_asian` (percent, neutral, category Demographics).
  - Values: `poverty_rate` includes `v: 0` for `16001`, tied values for `53033` and `41051`, and `v: null` with a `legacy` object for `02063`.

- [ ] **Step 1: Write failing tests** with a stubbed global `fetch`:

```ts
test("requests every file under the base path", async () => {
  await loadData("/pnw-health-dashboard/");
  expect(fetchedUrls()).toEqual(expect.arrayContaining([
    "/pnw-health-dashboard/data/manifest.json",
    "/pnw-health-dashboard/data/values.json",
    "/pnw-health-dashboard/data/counties.topojson",
  ]));
});
test("rejects a non-OK response", async () => { /* 404 for values.json */
  await expect(loadData("/")).rejects.toThrow(/values\.json/);
});
test("rejects an unsupported schema major", async () => { /* schema_version "2.0.0" */
  await expect(loadData("/")).rejects.toThrow(/schema/i);
});
```

`useData.test.tsx`: `"reaches ready"`; `"reports error, and retry refetches and reaches ready"` (fails once, then `act(() => state.retry())`); `"aborts the in-flight request on unmount"`.

- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `loadData`, `useData` (an `AbortController` per effect, so `StrictMode`'s double effect doesn't surface an abort as an error; a retry counter re-triggers the effect), and `ErrorPage`. `App` calls `useData()` once and renders loading text, `ErrorPage`, or a ready placeholder.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(web): load exported data with error and retry states`.

### Task M2.T3: Composite projection and SVG county map (#13)

**Files:**
- Create: `web/src/map/buildMapPaths.ts`, `web/src/map/CountyMap.tsx`, `web/src/map/buildMapPaths.test.ts`, `web/src/map/CountyMap.test.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: `CountiesTopology`, `fixtures.topology`.
- Produces:
  - `type Extent = [[number, number], [number, number]]`
  - `const MAP_LAYOUT: { width: 960; height: 600; main: Extent; inset: Extent }` with `main: [[352, 16], [944, 584]]` and `inset: [[16, 300], [336, 584]]`
  - `type MapPath = { fips: string; name: string; state: string; d: string }`
  - `function buildMapPaths(topology: CountiesTopology, layout?: typeof MAP_LAYOUT): MapPath[]`
  - `CountyMap` with props `{ paths: MapPath[]; fillFor: (fips: string) => string; tooltipFor: (fips: string) => string; selected: string | null; onSelect: (fips: string) => void }`

- [ ] **Step 1: Write failing tests:**

```ts
test("one path per county with finite coordinates", () => {
  const paths = buildMapPaths(topology);
  expect(paths.map(p => p.fips).sort()).toEqual(["02016","02063","16001","41051","53033"]);
  for (const p of paths) expect(coords(p.d).every(Number.isFinite)).toBe(true);
});
test("Alaska lands inside the inset, including Aleutians across the antimeridian", () => {
  const [[x0, y0], [x1, y1]] = MAP_LAYOUT.inset;
  const paths = buildMapPaths(topology).filter(p => p.state === "AK");
  for (const [x, y] of points(paths)) {
    expect(x).toBeGreaterThanOrEqual(x0 - 1); expect(x).toBeLessThanOrEqual(x1 + 1);
    expect(y).toBeGreaterThanOrEqual(y0 - 1); expect(y).toBeLessThanOrEqual(y1 + 1);
  }
});
test("the lower 48 land inside the main extent", () => { /* same, for main */ });
```

`CountyMap.test.tsx`: `"renders a path[data-fips] per county"`; `"click calls onSelect with the zero-padded fips"` (`"02016"`); `"hover shows tooltipFor text"`; `"the selected county has aria-current and renders last"`; `"labels the inset 'Alaska (not to scale)'"`.

- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `buildMapPaths`: split features by `state === "AK"`; `geoConicEqualArea().parallels([43, 48]).rotate([118, 0]).fitExtent(main, ...)` and `.parallels([55, 65]).rotate([154, 0]).fitExtent(inset, ...)`. Implement `CountyMap` as two `<g>` groups plus a bordered inset. Render the selected path last so neighbors don't cover its outline. Use a temporary single `fillFor` in `App`.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** With real exports present in `web/public/data/`, run `npm run dev` and check by eye: 149 shapes, Alaska inset legible and unclipped, no band across the map. Adjust `MAP_LAYOUT` or parallels if needed and note any change in the PR.
- [ ] **Step 6:** Commit: `feat(web): composite projection and SVG county map`.

### Task M2.T4: Color scales and legend (#14)

**Files:**
- Create: `web/src/color/makeColorScale.ts`, `web/src/color/formatValue.ts`, `web/src/color/Legend.tsx`, and a `.test` file for each
- Modify: `web/src/map/CountyMap.tsx` (add `<pattern id="hatch-null">`), `web/src/App.tsx`

**Interfaces:**
- Consumes: `Indicator`, `ValueEntry`, `Unit`.
- Produces:
  - `const HATCH_FILL = "url(#hatch-null)"`
  - `type LegendBin = { color: string; min: number; max: number }`
  - `type ColorScale = { fill: (v: number | null) => string; bins: LegendBin[]; ends: { low: "Better" | "Worse"; high: "Better" | "Worse" } | null }`
  - `function makeColorScale(indicator: Indicator, entries: Record<string, ValueEntry>): ColorScale`
  - `function formatValue(v: number | null, unit: Unit): string`
  - `Legend` with props `{ scale: ColorScale; unit: Unit }`

- [ ] **Step 1: Write failing tests:**

```ts
const scale = (dir, vs) => makeColorScale(ind(dir), entries(vs));
const vs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
test("higher_is_worse: darkest color at the top", () => {
  expect(scale("higher_is_worse", vs).fill(10)).toBe(schemeOrRd[5][4]);
  expect(scale("higher_is_worse", vs).fill(1)).toBe(schemeOrRd[5][0]);
});
test("higher_is_better reverses the ramp", () => {
  expect(scale("higher_is_better", vs).fill(10)).toBe(schemeOrRd[5][0]);
  expect(scale("higher_is_better", vs).fill(1)).toBe(schemeOrRd[5][4]);
});
test("neutral uses blues, darker is higher, no better/worse ends", () => {
  const s = scale("neutral", vs);
  expect(s.fill(10)).toBe(schemeBlues[5][4]);
  expect(s.ends).toBeNull();
});
test("ends follow direction", () => {
  expect(scale("higher_is_worse", vs).ends).toEqual({ low: "Better", high: "Worse" });
  expect(scale("higher_is_better", vs).ends).toEqual({ low: "Worse", high: "Better" });
});
test("null is hatched, zero is colored", () => {
  const s = scale("higher_is_worse", [0, 1, 2, 3, null]);
  expect(s.fill(null)).toBe(HATCH_FILL);
  expect(s.fill(0)).not.toBe(HATCH_FILL);
});
test("nulls do not affect bins", () => {
  expect(scale("higher_is_worse", [...vs, null]).bins)
    .toEqual(scale("higher_is_worse", vs).bins);
});
test("ties collapse empty bins", () => {
  const b = scale("higher_is_worse", [5, 5, 5, 5, 5, 5, 9]).bins;
  expect(b.length).toBeLessThan(5);
  expect(b.every(x => x.min <= x.max)).toBe(true);
});
test("all-null gives no bins and does not throw", () => {
  expect(scale("higher_is_worse", [null, null]).bins).toEqual([]);
});
```

`formatValue`: `(12.34,"percent")→"12.3%"`, `(72400,"dollars")→"$72,400"`, `(78.25,"years")→"78.3 years"`, `(123.4,"rate_per_100k")→"123.4 per 100k"`, `(1234,"count")→"1,234"`, `(0,"percent")→"0.0%"`, `(null,"percent")→"Suppressed or not available"`.

`Legend`: `"shows bin bounds formatted by unit"`, `"always shows the hatch entry"`, `"shows Better and Worse for directional, neither for neutral"`.

- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Bins are built by grouping the non-null values by their assigned color, keeping non-empty groups in ascending value order. Wire `App`: fill from `values[id]?.[fips]?.v ?? null`, tooltip `"{name}, {state}: {formatValue}"`, for the first catalog indicator.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(web): direction-aware color scales and legend`.

### Task M2.T5: Indicator picker and URL state (#15)

**Files:**
- Create: `web/src/explorer/parseParams.ts`, `web/src/explorer/useExplorerParams.ts`, `web/src/explorer/IndicatorPicker.tsx`, `web/src/explorer/Explorer.tsx`, and a `.test` file for each
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `Manifest`, `AppData`, `buildMapPaths`, `CountyMap`, `makeColorScale`, `Legend`.
- Produces:
  - `type ParamKey = "i" | "c" | "mode" | "view"`
  - `type ExplorerParams = { indicator: string; county: string | null; mode: "values"; view: "map"; invalid: ParamKey[] }`
  - `function parseParams(search: string, manifest: Manifest, fipsSet: ReadonlySet<string>): ExplorerParams`
  - `function useExplorerParams(manifest: Manifest, fipsSet: ReadonlySet<string>): { params: ExplorerParams; setIndicator: (id: string) => void; setCounty: (fips: string) => void }`
  - `IndicatorPicker` with props `{ indicators: Indicator[]; selectedId: string; onSelect: (id: string) => void }`
  - `Explorer` with props `{ data: AppData }`

- [ ] **Step 1: Write failing tests:**

```ts
const parse = (s: string) => parseParams(s, manifest, new Set(["53033", "02016"]));
test("defaults to the first catalog indicator", () => {
  expect(parse("")).toEqual({ indicator: manifest.indicators[0].id, county: null,
    mode: "values", view: "map", invalid: [] });
});
test("reads valid params", () => {
  expect(parse("?i=median_household_income&c=02016"))
    .toMatchObject({ indicator: "median_household_income", county: "02016", invalid: [] });
});
test("a bad param is flagged alone, the rest kept", () => {
  expect(parse("?i=bogus&c=53033"))
    .toMatchObject({ indicator: manifest.indicators[0].id, county: "53033", invalid: ["i"] });
});
test("an unpadded fips is invalid", () => {
  expect(parse("?c=2016")).toMatchObject({ county: null, invalid: ["c"] });
});
test("unbuilt mode and view are invalid in M2", () => {
  expect(parse("?mode=model&view=table").invalid).toEqual(["mode", "view"]);
});
```

`useExplorerParams.test.tsx`, in a `MemoryRouter`: `"removes only invalid params"` (`?i=bogus&c=53033` → search `?c=53033`); `"cleanup replaces history instead of pushing"` (history length unchanged); `"setIndicator keeps c and pushes"`; `"setCounty keeps i and pushes"`.

`IndicatorPicker.test.tsx`: `"groups by category in catalog order"`; `"filters case-insensitively by label"`; `"shows 'No indicators match' when nothing matches"`; `"marks the selected option aria-pressed"`; `"is operable by keyboard"` (`userEvent.tab` then `{Enter}` calls `onSelect`).

`Explorer.test.tsx`: `"picking an indicator updates the legend and the URL"`; `"clicking a county sets c and marks it selected"`.

- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `useExplorerParams` wraps `useSearchParams` and clears `invalid` in an effect with `{ replace: true }`. `Explorer` assembles picker, map and legend; `App` renders it when ready.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(web): indicator picker and URL state with bad-param fallback`.

### Task M2.T6: Routing and Pages 404 fallback (#16)

**Files:**
- Create: `web/public/404.html`, `web/public/spa-redirect.js`, `web/src/pages/Methodology.tsx`, `web/src/pages/About.tsx`, `web/src/pages/spaRedirect.test.ts`
- Modify: `web/index.html`, `web/src/App.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- Produces, in `public/spa-redirect.js` (a plain script, because `404.html` is not processed by Vite), attached to `globalThis.spaRedirect`:
  - `encode(location: {pathname, search, hash}, base: string): string`, returning `base + "?p=" + encodeURIComponent(path after base + search + hash)`
  - `decode(search: string, base: string): string | null`, returning the URL to restore, or `null` if there is no `p` or it doesn't start with a single `/`

- [ ] **Step 1: Write failing tests:**

```ts
const base = "/pnw-health-dashboard/";
const loc = (pathname, search = "", hash = "") => ({ pathname, search, hash });
test("round-trips path, query and hash", () => {
  const url = spaRedirect.encode(loc(base + "methodology", "?a=1&b=2", "#sources"), base);
  expect(spaRedirect.decode(url.slice(url.indexOf("?")), base))
    .toBe(base + "methodology?a=1&b=2#sources");
});
test("no p param gives null", () => expect(spaRedirect.decode("?i=x", base)).toBeNull());
test("a protocol-relative p is refused", () =>
  expect(spaRedirect.decode("?p=" + encodeURIComponent("//evil.example"), base)).toBeNull());
```

`App.test.tsx`: `"/methodology renders the stub"`; `"/about renders the stub"`; `"an unknown path redirects to the explorer"`; `"nav links reach each route"`.

- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `spa-redirect.js`. `404.html` loads `/pnw-health-dashboard/spa-redirect.js` and calls `location.replace(encode(...))`. `index.html` loads `%BASE_URL%spa-redirect.js` before the app module and calls `history.replaceState` with `decode(...)` when non-null. `App` keeps its single `useData()` call above `<Routes>`, passing state to the explorer route only, so loading and error screens apply to `/` and navigating between routes doesn't refetch.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck && npm run build`. Expected: all pass, and `dist/404.html` exists.
- [ ] **Step 5:** Commit: `feat(web): routes and GitHub Pages deep-link fallback`.

### Task M2.T8: `build-deploy.yml` and Playwright smoke test (#18)

**Files:**
- Create: `.github/workflows/build-deploy.yml`, `web/playwright.config.ts`, `web/e2e/smoke.spec.ts`
- Modify: `web/package.json` (add `@playwright/test@1.65.0`, script `test:e2e`), `web/eslint.config.js`, `web/vite.config.ts` (exclude `e2e/` from Vitest)

- [ ] **Step 1: Write the smoke test** in `e2e/smoke.spec.ts`, with Playwright `baseURL` `http://localhost:4173/pnw-health-dashboard/` and `webServer` `npm run preview -- --port 4173 --strictPort`:

```ts
test("load, pick an indicator, select a county", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("path[data-fips]")).toHaveCount(149);
  await page.getByRole("button", { name: "Poverty rate" }).click();
  await expect(page).toHaveURL(/[?&]i=poverty_rate/);
  await page.locator('path[data-fips="53033"]').click();
  await expect(page).toHaveURL(/[?&]c=53033/);
  await expect(page.locator('path[data-fips="53033"]')).toHaveAttribute("aria-current", "true");
});
```

- [ ] **Step 2:** With real exports in `web/public/data/`, run `npm run build && npx playwright install chromium && npm run test:e2e`. Expected: PASS.
- [ ] **Step 3:** Write `build-deploy.yml`:
  - Triggers: `push` to `main` and `milestone/**`; `schedule` `cron: "0 9 1 * *"`; `workflow_dispatch`.
  - `concurrency: { group: build-deploy-${{ github.ref }}, cancel-in-progress: false }`; workflow `permissions: contents: read`.
  - Job `build`: setup-uv and setup-node; `actions/cache` on `data/raw` with key `raw-${{ hashFiles('pipeline/src/pnw_health/config.py', 'pipeline/src/pnw_health/indicators.yaml') }}`; `uv run pnw-health run --root ..` in `pipeline/` with `CENSUS_API_KEY` from secrets; `npm ci`, `npm run build`, `npx playwright install --with-deps chromium`, `npm run test:e2e`; `actions/upload-pages-artifact` with `path: web/dist`.
  - Job `deploy`: `needs: build`, `if: github.ref == 'refs/heads/main'`, `permissions: { pages: write, id-token: write }`, `environment: github-pages`, `actions/deploy-pages`.
- [ ] **Step 4:** Commit: `ci: build, smoke-test, and deploy to GitHub Pages`. Squash-merge per `CONTRIBUTING.md`.
- [ ] **Step 5:** Run `gh run list --workflow build-deploy.yml --branch milestone/m2 --limit 1`, then inspect that run. Expected: `build` succeeds and `deploy` is skipped.

### Milestone review

- [ ] **Step 1:** On `milestone/m2`, run the full local commands from `CONTRIBUTING.md`, then fill in the milestone PR template with every issue PR, a `Closes #…` line for #11–18, and evidence including the green `build-deploy` run. Mark it ready for review.
- [ ] **Step 2:** The author reviews with `docs/milestone-review-template.md` and merges with a merge commit.
- [ ] **Step 3:** After merge, run `gh workflow run build-deploy.yml --ref main` and complete the template's after-merge checks. A failure gets a hotfix per `CONTRIBUTING.md`.
