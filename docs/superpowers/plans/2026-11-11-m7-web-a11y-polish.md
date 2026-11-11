# M7 Web a11y + Polish Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three accessibility bugs on the live site (outline contrast, late-heading focus, no skip link) and clear the M2–M6 web review debt (#130, #129, #81, #83).

**Architecture:** Mostly local edits to existing components and hooks. `CountyPanel` gains a `modelMode` prop that reorders its sections. Three small shared components come out of the tables and legends. A Node static server that behaves like GitHub Pages runs under a third Playwright project, so the real `404.html` path gets tested.

**Tech Stack:** React 19, TypeScript 6.0, React Router 8, Vitest, Testing Library, Playwright 1.65 (+ `@axe-core/playwright`). No pipeline changes.

**Spec:** `docs/superpowers/specs/2026-11-11-m7-web-a11y-polish-design.md`, with parent `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md` and `docs/superpowers/specs/2026-11-11-m6-methodology-polish-design.md`. **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`.

## Global Constraints

- All earlier web constraints still apply: FIPS are 5-character strings, TypeScript stays `~6.0.3`, import from `react-router`, URLs go through `import.meta.env.BASE_URL`, null is not zero (`??`, never `||`, on values).
- No pipeline, contract or `schema/` changes, and no new runtime or dev dependencies. #83 may change versions or add an npm `overrides` entry only.
- The M5 tier fills (`#ca0020`, `#f4a582`, `#e3e3e3`, `#92c5de`, `#0571b0`) and the values-mode d3 ramps don't change.
- County outline stroke, exactly: `#808080`. The hover/focus stroke stays `#333` at width 1.
- Exact copy: skip link "Skip to county search".
- Copy never describes the factors with "cause(s)/caused", "driver(s)/drive(s)" or "explain(s) the difference". Say "associated with".
- Web checks: `cd web && npm run lint && npm run typecheck && npm test`. Playwright: `cd web && npm run build && CI=1 npm run test:e2e`. PR `ci` skips Playwright, so run it locally before opening any PR that touches `e2e/`, `playwright.config.ts`, the panel or the Explorer.

## Review Focus

1. **Leaving before the heading renders.** The user navigates from `/` (still loading) to `/about` before the data arrives. The pending focus wait must not later pull focus back to the Explorer heading. *(Test in T2.)*
2. **Skip link with the panel open or in table view.** The search box is present in every view and mode, so the link must work in all of them. Activating it must not change the URL (no `#` added, no `c` cleared). *(Test in T3.)*
3. **Switching mode with a county open.** Toggling Values↔Model with the panel open reorders its sections in place. The panel keeps the county and doesn't steal focus. *(Test in T4.)*
4. **Two hatch swatches on one page.** `Legend` and `ModelLegend` never render together today, but each `HatchSwatch` needs its own pattern id, so two can coexist without one `url(#…)` resolving to the other. *(Test in T5.)*
5. **A 404 path outside the base.** The Pages-like server must answer a path outside `/pnw-health-dashboard/` with a 404 too, not crash or serve the app, as GitHub Pages does. *(Test in T6.)*

---

### Milestone start (no issue)

- [ ] **Step 1:** `milestone/m7` exists locally with the spec commit (`b4caa53`). Confirm it's based on current `origin/main`: `git merge-base --is-ancestor origin/main milestone/m7`.
- [ ] **Step 2:** In the roadmap's M7 section, prefix each line with its task ID (T1 #138, T2 #139, T3 #98, T4 #130, T5 #129, T6 #81, T7 #83). Note #82 as "closed by M6 (spec §3.8)". Add the work order line: "Work order: T1–T7 in order (spec §3)."
- [ ] **Step 3:** Commit to `milestone/m7`: `docs: number the M7 tasks in the roadmap`.
- [ ] **Step 4:** Push with `-u origin milestone/m7` and open the draft PR `milestone/m7 → main` using `.github/PULL_REQUEST_TEMPLATE/milestone.md`.
- [ ] **Step 5:** Reconcile issues. Retitle each one `M7.T<k> <current title>`, and append to each body a link to its task here plus the task's acceptance criteria. Comment on #82 with spec §3.8's note; it closes from the milestone PR. Move T1–T7 to `Ready`.

### Task M7.T1: County outline contrast (#138)

**Files:**
- Create: `web/src/color/contrast.ts`, `web/src/map/outlineContrast.test.ts`
- Modify: `web/src/styles.css` (`.county` stroke), `docs/superpowers/specs/2026-11-11-m6-methodology-polish-design.md` §6

**Interfaces:**
- Produces: `contrastRatio(a: string, b: string): number` in `contrast.ts`. It takes `#rrggbb`, computes WCAG 2.x relative luminance, and returns `(L1 + 0.05) / (L2 + 0.05)` with the lighter colour first. It throws on any other format.

- [ ] **Step 1: Write failing tests** in `outlineContrast.test.ts`:
  - `contrastRatio("#000000", "#ffffff")` ≈ 21 (`toBeCloseTo(21, 2)`); `contrastRatio("#767676", "#ffffff")` ≈ 4.54 (`toBeCloseTo(4.54, 2)`); the result is the same with the arguments swapped; `"#fff"` throws.
  - Read `src/styles.css` with `readFileSync(new URL("../styles.css", import.meta.url), "utf8")`. Take the `stroke:` value from the `.county {` block (the first rule whose selector is exactly `.county`). Assert it is ≥ 3 against each of: `#ffffff`, `tierFill("none")`, `#f2f2f2` (the hatch background), `schemeBlues[5][0]` and `schemeOrRd[5][0]`. The test title names each fill, so a failure says which.
- [ ] **Step 2:** Run `npx vitest run src/map/outlineContrast.test.ts`. Expect `contrastRatio` to be missing; once it exists, the stroke assertions fail at 1.55–1.98.
- [ ] **Step 3:** Implement `contrastRatio`. Change `.county { stroke: #b8b8b8 }` to `#808080`.
- [ ] **Step 4:** Run the web checks; all pass. Run Playwright: the axe states are unchanged.
- [ ] **Step 5:** Apply the M6 spec §6 amendment from M7 spec §2: boundaries are required graphics under 1.4.11, the stroke is ≥ 3:1 against the page and the pale fills, and the dark-fill limit and its rationale (M7 spec §3.1) apply.
- [ ] **Step 6:** Commit: `fix(web): raise county outline contrast to 3:1`. PR body: `Part of #138`, with before/after map screenshots in values and model mode.

### Task M7.T2: Route focus after a late heading (#139)

**Files:**
- Modify: `web/src/hooks/useRouteFocus.ts`, `web/src/hooks/useRouteFocus.test.tsx`

**Interfaces:**
- Produces: `useRouteFocus(): void`, same signature as now. New behavior: if `[data-page-heading]` is missing after a qualifying pathname change, a `MutationObserver` on `document.body` (`{ childList: true, subtree: true }`) waits for it, focuses it once, and disconnects. The effect's cleanup disconnects it, which covers both the next pathname change and unmount.

- [ ] **Step 1: Write failing tests** in `useRouteFocus.test.tsx`. Add a route `/late` whose element renders a "Load" button and, once that's clicked, `<h2 data-page-heading tabIndex={-1}>Late page</h2>`. A `useState` stands in for the data load.
  - "a heading that renders after the route change gets focus": start at `/`, click a link to `/late`, then click "Load". Expect "Late page" to have focus.
  - "leaving before the heading renders cancels the wait" (Review Focus 1): `Shell` gains an "Inject" button outside `<Routes>` that, once clicked, renders `<h2 data-page-heading tabIndex={-1}>Injected</h2>`. Start at `/`, go to `/late` (no heading yet), then to `/b` (its heading gets focus). Then `fireEvent.click` "Inject", which doesn't move focus the way `userEvent` would. Expect "B page" to keep focus.
  - "a cold redirect while loading focuses the heading once it renders": `MemoryRouter initialEntries={["/nowhere"]}` with a `*` route that renders `<Navigate to="/late" replace />`. Click "Load" and expect "Late page" to have focus.
- [ ] **Step 2:** Run `npx vitest run src/hooks/useRouteFocus.test.tsx`. The three new tests fail; the four existing ones pass.
- [ ] **Step 3:** Implement the observer in the existing effect. Keep the first-render, hash and search-only rules.
- [ ] **Step 4:** Run the web checks; all pass.
- [ ] **Step 5:** Commit: `fix(web): focus a route heading that renders after the data loads`. PR body: `Part of #139`.

### Task M7.T3: Skip link to the county search (#98)

**Files:**
- Modify: `web/src/search/CountySearch.tsx` (+ test), `web/src/explorer/Explorer.tsx`, `web/src/explorer/Explorer.test.tsx`, `web/src/styles.css`, `web/e2e/a11y.spec.ts`

**Interfaces:**
- Produces:
  - `CountySearch` gains an `inputId?: string` prop. When given, it is the input's `id` (and the label's `htmlFor`) instead of the `useId()`-derived one. Explorer passes `inputId="county-search"`.
  - In `Explorer`, the first element inside `.explorer` (before `<aside className="explorer-picker">`) is `<a className="skip-link" href="#county-search">Skip to county search</a>`. Its `onClick` calls `preventDefault()` and focuses `#county-search`, so the URL never gains a hash.
  - `.skip-link` in `styles.css`: positioned off-screen until `:focus`, then shown in place, with the existing `:focus-visible` outline.

- [ ] **Step 1: Write failing tests.**
  - `CountySearch.test.tsx`: with `inputId="x"` the input has `id="x"` and its label is still associated (`getByRole("combobox", { name: "Search counties" })`).
  - `Explorer.test.tsx`: "the first Tab reaches the skip link, and Enter focuses the search". From `document.body`, `user.tab()` focuses the link named "Skip to county search", `user.keyboard("{Enter}")` focuses the combobox, and the router location's `search` is unchanged with an empty `hash`.
  - `Explorer.test.tsx` (Review Focus 2): the same Enter works with `?view=table&c=53033&mode=model`, and afterwards the location still contains `c=53033`.
  - `a11y.spec.ts`: "skip link reaches the county search". Go to `./?i=poverty_rate`, wait for `.indicator-title`, press Tab until the link has focus (at most 10 presses; the site header nav comes first), press Enter, and expect the combobox "Search counties" to be focused. Runs on both projects.
- [ ] **Step 2:** Run the unit tests; the new ones fail.
- [ ] **Step 3:** Implement the prop, the link and the CSS.
- [ ] **Step 4:** Run the web checks and Playwright on both projects; all pass, and axe finds nothing new.
- [ ] **Step 5:** Commit: `feat(web): add a skip link to the county search`. PR body: `Part of #98`.

### Task M7.T4: Model UI test and polish follow-ups (#130)

**Files:**
- Modify: `web/src/panel/CountyPanel.tsx` (+ test), `web/src/explorer/Explorer.tsx`, `web/src/explorer/Explorer.test.tsx`, `web/src/color/formatValue.ts` (+ test), `web/src/table/sortModelRows.test.ts`, `web/src/table/ModelTable.test.tsx`, `web/src/App.test.tsx`, `web/src/App.tsx`, `web/playwright.config.ts`, `web/e2e/smoke.spec.ts`; parent spec §6 (county panel)

**Interfaces:**
- Produces:
  - `CountyPanel` gains `modelMode: boolean`. Explorer passes `modelMode={params.mode === "model"}`. In model mode, `.panel-body` renders `ModelCard`, then the indicator block (measure label, value or missing message, `StripPlot`), then `WhoLivesHere`. In values mode the order is as today. Move the indicator block into a local `const indicatorSection = (…)`, so both orders render the same JSX.
  - `formatSigned(v: number, unit: Unit, digits?: number): string`. With `digits` omitted, it passes `undefined` to `formatBound` and gets the per-unit default. The existing `"years"` callers' output doesn't change.
  - `tierCounts(…)` in Explorer is wrapped in `useMemo` keyed on `[model, counties]`, placed above the early `return null`.

- [ ] **Step 1: Write failing tests.**
  - `CountyPanel.test.tsx`: with `modelMode`, the model card heading "Life expectancy model" comes before the `.panel-measure` element in document order (`compareDocumentPosition`). Without it, the order is reversed.
  - `Explorer.test.tsx` (Review Focus 3): with `?c=53033` open, clicking "Model" puts the model card first, keeps `c=53033`, and leaves focus on the Model button.
  - `Explorer.test.tsx`, focus binding: the test "focusRequested is cleared when a selection renders no panel" ends with a map click, and `onSelectFromMap` clears `focusFips` on its own, so the FIPS binding is never exercised. Replace that last step with `await act(() => router.navigate("/?c=41051"))`, a URL change that doesn't go through any select handler. Expect the "Multnomah" heading not to have focus.
  - `Explorer.test.tsx`, Back to the same county: "Back to the county a pending request named fulfils it". Search-select King inside `act` together with `router.navigate("/?c=bogus")` (as above), then `act(() => router.navigate(-1))` back to `c=53033`. Expect the "King" heading to have focus. The request was for that county and was never handled, so the test pins this behavior and documents it in its title.
  - `formatValue.test.ts`: `formatSigned(1500, "dollars")` is `"+$1,500"` (per-unit default, whole dollars); `formatSigned(2.6, "percent")` stays `"+2.6%"`. The existing sign, U+2212 and zero tests stay as they are.
  - `sortModelRows.test.ts`: the "rows with no value are ordered by name" test gets a second null row whose name sorts before the first, and asserts both orders.
  - `ModelTable.test.tsx`: a row with residual `-1.24` shows `−1.2 years` in the Difference cell; a row with residual `0.01` shows no `+` or `−`.
- [ ] **Step 2:** Run the unit tests; the new ones fail (the `formatSigned` dollars case and the panel order at least).
- [ ] **Step 3:** Implement `modelMode`, the `formatSigned` default and the `useMemo`.
- [ ] **Step 4:** In `smoke.spec.ts`'s model-mode test, make the `goBack()` waits positive: the first expects `/[?&]c=53033/` and `/[?&]mode=model/`; the second expects `/[?&]mode=model/`; the third waits for `.legend` to contain "%" and then checks `expect(new URL(page.url()).search).toBe("?i=poverty_rate")`. Merge the duplicate `react-router` import in `App.test.tsx`, then run `npx prettier --write src/App.tsx playwright.config.ts`.
- [ ] **Step 5:** Run the web checks and Playwright on both projects; all pass.
- [ ] **Step 6:** Apply the parent spec §6 county-panel amendment from M7 spec §2.
- [ ] **Step 7:** Commit: `feat(web): model card first in model mode, plus M5 test follow-ups`. PR body: `Part of #130`, with one line per #130 bullet saying where it was done.

### Task M7.T5: Shared table and legend components (#129)

**Files:**
- Create: `web/src/table/SortHeader.tsx`, `web/src/table/CountyCell.tsx`, `web/src/color/HatchSwatch.tsx`, each with a `.test.tsx`
- Modify: `web/src/table/CountyTable.tsx`, `web/src/table/ModelTable.tsx`, `web/src/color/Legend.tsx`, `web/src/model/ModelLegend.tsx`

**Interfaces:**
- Produces:
  - `SortHeader<K extends string>({ sortKey, label, sort, onSort }: { sortKey: K; label: string; sort: { key: K; dir: SortDir }; onSort: (next: { key: K; dir: SortDir }) => void })` renders the `<th scope="col" aria-sort>` and its `.sort-button`. The toggle rule moves inside it: the same key flips the direction; a new key starts `asc`.
  - `CountyCell({ fips, name, state, selected, onSelect }: { fips: string; name: string; state: string; selected: boolean; onSelect: (fips: string, opener: HTMLElement) => void })` renders the `<td>` with the `.table-county` button (`aria-label` "{name}, {state}", `aria-current="true"` when selected).
  - `HatchSwatch()` renders the 16×16 `svg.legend-swatch` (`aria-hidden`) with its own `<pattern>`, id from `useId()`. The pattern uses the same `#f2f2f2` background and `#999` 1.5px line as today.

- [ ] **Step 1: Write failing tests** for the three new components: `aria-sort` is `none`/`ascending`/`descending` correctly; clicking the active header calls `onSort` with the flipped direction, and an inactive one with `asc`; `CountyCell` passes its FIPS and button and sets `aria-current` only when selected. Review Focus 4: two `HatchSwatch`es in one render have different pattern ids, and each `rect`'s `fill` is `url(#<its own id>)`.
- [ ] **Step 2:** Run them; they fail.
- [ ] **Step 3:** Implement the components and switch the four consumers over. Don't touch the existing tests of the four consumers.
- [ ] **Step 4:** Run the web checks: all pass, and `git diff --stat` shows no change to `CountyTable.test.tsx`, `ModelTable.test.tsx`, `Legend.test.tsx` or `ModelLegend.test.tsx`.
- [ ] **Step 5:** Commit: `refactor(web): share SortHeader, CountyCell and HatchSwatch`. PR body: `Part of #129`.

### Task M7.T6: Real 404 deep-link test (#81)

**Files:**
- Create: `web/e2e/pages-server.mjs`, `web/e2e/pages404.spec.ts`
- Modify: `web/playwright.config.ts`

**Interfaces:**
- Produces:
  - `node e2e/pages-server.mjs <distDir> <port>`: a Node `http` server with no dependencies. For `GET /pnw-health-dashboard/<path>` it serves `dist/<path>` if that's a file, or `dist/<path>/index.html` if that's a directory, with a content type from the extension (`.html`, `.js`, `.css`, `.json`, `.svg`, `.png`, `.topojson`→`application/json`). Anything else gets status 404 with the body of `dist/404.html`. That includes paths outside the base, and any path that, once percent-decoded and resolved, lands outside `dist/`.
  - `playwright.config.ts`: `webServer` becomes an array. It keeps the preview entry and adds `{ command: "node e2e/pages-server.mjs dist 4175", url: "http://localhost:4175/pnw-health-dashboard/", reuseExistingServer: !process.env.CI }`. A third project, `{ name: "pages", use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4175/pnw-health-dashboard/" }, testMatch: /pages404\.spec\.ts/ }`. `chromium` and `mobile` ignore `pages404.spec.ts`.

- [ ] **Step 1: Write the spec** `pages404.spec.ts`:
  - "a deep link through the real 404 restores path, query and hash": `const res = await page.request.get("./methodology?i=poverty_rate")` has status 404. Then `page.goto("./methodology?i=poverty_rate#sources")`. Expect the "Methodology" level-2 heading to be visible, and `new URL(page.url())` to have pathname `/pnw-health-dashboard/methodology`, search `?i=poverty_rate` and hash `#sources`.
  - Review Focus 5: `page.request.get("http://localhost:4175/elsewhere")` and `http://localhost:4175/pnw-health-dashboard/%2e%2e/package.json` each have status 404. The `..` is percent-encoded so the client doesn't normalize it away before the server sees it.
- [ ] **Step 2:** Run `npm run build && CI=1 npx playwright test --project=pages`. It fails: there's no server or project yet.
- [ ] **Step 3:** Implement the server and the config.
- [ ] **Step 4:** Run `CI=1 npm run test:e2e` (all three projects); all pass. `build-deploy.yml` runs `npm run test:e2e` after `npm run build`, so it picks up the new project with no workflow change. Confirm that in the PR.
- [ ] **Step 5:** Commit: `test(web): cover the real 404.html deep-link path`. PR body: `Part of #81`.

### Task M7.T7: Dev-only npm audit findings (#83)

All 10 moderate findings come from one advisory, GHSA-g3hv-75wg-m249 (`minimatch` `>=7.0.0 <11.0.1`), pulled in through `eslint@10.14.0` and `typescript-eslint@8.72.2`. npm's suggested fix downgrades eslint to 9, which is not acceptable.

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`; #83 (comment)

- [ ] **Step 1:** Run `npm outdated`. Update `eslint`, `@eslint/js` and `typescript-eslint` within their current majors to the newest versions published at least two weeks ago. Rerun `npm audit`. If it shows 0, skip to Step 4.
- [ ] **Step 2:** Otherwise add `"overrides": { "minimatch": "<newest 11.0.x published at least two weeks ago>" }` (exact version), then `npm install`.
- [ ] **Step 3:** Run `npm run lint` and diff its output against `main`'s. Same result: keep the override. A crash or changed results: remove it and go to Step 5.
- [ ] **Step 4:** Confirm `npm audit` shows 0 and `npm audit --omit=dev` shows 0, then run the web checks and Playwright.
- [ ] **Step 5 (only if the override was removed):** Comment on #83 with the advisory, the dependency path, and why it's accepted: dev-only, not in `dist/`, and eslint matches only the repo's own glob patterns, never untrusted input. Note that it will clear when eslint moves to minimatch ≥11.0.1.
- [ ] **Step 6:** Commit: `chore(web): clear dev-only npm audit findings` (or `chore(web): record accepted npm audit finding`). PR body: `Part of #83`, with the before and after `npm audit` summaries.

### Milestone PR

- [ ] Fill in the milestone template with every issue PR and `Closes #138`, `#139`, `#98`, `#130`, `#129`, `#81`, `#83`, `#82`, with spec §3.8's note for #82. Evidence: the web checks; `CI=1 npm run test:e2e` on all three projects; the axe summary (zero serious or critical); the `npm audit` result; screenshots of the map in values and model mode with the new outlines and of the panel in model mode; the green `build-deploy` run on `milestone/m7`. Then mark it ready for review.
