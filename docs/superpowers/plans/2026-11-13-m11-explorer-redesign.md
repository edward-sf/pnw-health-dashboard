# M11 Explorer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The explorer's map is the largest, steadiest thing on the page: measures are chosen from a toolbar, the county panel floats over the map, Alaska and state borders are easy to read, and the site has a dark mode and Radix controls throughout.

**Architecture:** Web only. The URL stays the single source of explorer state; `mode` is replaced by a `show` parameter that only exists for modelled outcomes. The map canvas is re-laid-out in `buildMapPaths`, with state borders and hit halos derived from the existing topology. The panel becomes a non-modal Radix Dialog (vaul Drawer on phones). Theme-dependent data neutrals move into a `Palette` object passed to the fill and outline functions; everything else themes through CSS tokens.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4, shadcn components (Radix, cmdk, vaul), Lucide, d3-geo, topojson-client, Vitest, Testing Library, Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-11-13-m11-explorer-redesign-design.md`. Read it with this plan; section references (§) point there.

## Global Constraints

- No pipeline, export-contract or `schema/` change. Nothing under `pipeline/` or `schema/` is touched.
- Breakpoints stay as they are: phone is `PHONE_QUERY = "(max-width: 720px)"`; the floating panel applies from 721px.
- Phone touch targets stay at least 44×44 CSS px.
- Exact copy: category labels "Indicators", "Demographics", "Outcomes"; switch labels "Observed", "Compared with expected", "Map", "Table"; "Select a county for its details"; "No measures match"; "No matching counties"; "Search counties"; theme items "Light", "Dark", "System". The words "Values mode" and "Model mode" appear nowhere in the interface, About or README after Task 7.
- The sequential ramps and the four colored tiers keep their hex values in both themes. Only `tierNone`, `hatchBackground` and `hatchLine` differ by theme.
- Every county outline is at least 3:1 against its own fill, in both palettes.
- One focus indicator: the global `:focus-visible` outline in `web/src/styles.css`. No component adds its own ring.
- shadcn components are added with `npx shadcn@latest add <name> -y` from `web/`, then edited onto the tokens. After each add, check `package.json` and the new file's imports: `cn` must come from `@/lib/utils`, and no package named `cn` may be installed.
- Class names that tests and e2e rely on are kept unless a task says otherwise: `county-map`, `county`, `legend`, `county-table`, `indicator-title`, `indicator-description`, `county-panel`, `panel-value`, `panel-measure`, `strip-plot-chart`.
- Issue branches are cut from `milestone/m11`, named `<issue-number>-<short-slug>`. PRs target `milestone/m11`, titles are Conventional Commits, bodies say `Part of #<n>` (CONTRIBUTING).
- PR `ci` skips Playwright; before each PR that touches it run `cd web && npm run build && CI=1 npx playwright test`. After each squash-merge check the `build-deploy` run on `milestone/m11`.

## Review Focus

1. **An old shared link**, `?mode=model&t=injury_deaths&c=53033&view=table`. Expected: injury deaths, Compared with expected, table view, King County open, and the address bar rewritten without `mode` or `t`. Test in Task 2.
2. **`show=expected` on a measure with no model**, `?i=poverty_rate&show=expected`. Expected: the Observed map, no switch, and `show` removed from the URL. Test in Task 2.
3. **Clicking the map or the toolbar while the panel is open.** Expected: the panel stays; a second county replaces its contents; Escape with the measure popover open closes only the popover. Tests in Tasks 3 and 5.
4. **Theme storage that is blocked or holds a bad value** (private window, `pnw-theme=purple`). Expected: System, no error, and the menu still works for the session. Test in Task 6.
5. **Switching category when the filter or the last-viewed measure doesn't apply.** Expected: the category's first measure is selected, the filter text is cleared, and the map never renders empty. Test in Task 3.

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `web/src/map/buildMapPaths.ts` | `MAP_LAYOUT`, county paths with `halo` | 1 |
| `web/src/map/buildStateBorders.ts` | State-border path from the topology | 1 |
| `web/src/map/CountyMap.tsx` | Draws halos, counties, selected ring, borders | 1, 6 |
| `web/src/explorer/categories.ts` | Manifest category → measure group | 2 |
| `web/src/explorer/parseParams.ts`, `useExplorerParams.ts` | URL state: `show`, `canonical`, legacy `mode` | 2 |
| `web/src/explorer/MeasurePicker.tsx` | Category switch + measure combobox | 3 |
| `web/src/explorer/Explorer.tsx` | Toolbar, stage, panel wiring | 2, 3, 5 |
| `web/src/search/matchCounties.ts`, `CountySearch.tsx` | County matching; combobox | 4 |
| `web/src/panel/PanelShell.tsx` | Dialog (≥721px) or Drawer (phone) around the panel | 5 |
| `web/src/panel/CountyPanel.tsx`, `ModelCard.tsx` | Panel contents; outcome select in the card | 5 |
| `web/src/theme/theme.ts`, `ThemeProvider.tsx`, `ThemeMenu.tsx` | Theme choice, storage, header menu | 6 |
| `web/src/color/palette.ts` | Theme-dependent data neutrals | 6 |
| `web/src/components/ui/*` | shadcn components | 3, 4, 5, 6 |
| `web/src/styles.css` | Tokens (light and `.dark`), layout | all |
| `web/e2e/stage.spec.ts`, `a11y.spec.ts`, `keyboard.spec.ts` | Stage stability; axe; keyboard walkthrough | 3, 5, 8 |

---

### Task 0: Milestone setup (no issue)

- [ ] **Step 1:** Add an `## M11 — Explorer redesign` section to `docs/superpowers/plans/2026-11-10-roadmap.md` with the goal sentence above and Tasks 1–8 as `M11.T1`–`M11.T8`.
- [ ] **Step 2:** Create GitHub milestone `M11 Explorer redesign` and one issue per task, titled `M11.T<n> <task title>`, labelled `area:web` and `type:feature` (`type:docs` for T7, `type:chore` for T8), each body linking this plan's task section and listing its exit criteria. Write the issue numbers into the roadmap section.
- [ ] **Step 3:** Commit the spec, this plan and the roadmap on a `docs/m11-plan` branch, PR into `milestone/m11`, squash-merge.
- [ ] **Step 4:** Open the draft milestone PR `milestone/m11 → main` with `gh pr create --draft --template milestone.md`.

---

### Task 1: Map canvas — larger Alaska, state borders, hit halos, selected ring

**Files:**
- Modify: `web/src/map/buildMapPaths.ts`, `web/src/map/CountyMap.tsx`, `web/src/styles.css`
- Create: `web/src/map/buildStateBorders.ts`
- Test: `web/src/map/buildMapPaths.test.ts`, `web/src/map/buildStateBorders.test.ts`, `web/src/map/CountyMap.test.tsx`

**Interfaces:**
- Produces:
  - `MAP_LAYOUT = { width: 1280, height: 680, main: [[616, 16], [1264, 664]], inset: [[16, 180], [560, 664]] }`
  - `type MapPath = { fips: string; name: string; state: string; d: string; halo: number }` — `halo` is a stroke width in canvas units, `0` for none.
  - `haloWidth(bounds: Extent, area: number): number` exported from `buildMapPaths.ts`.
  - `lower48Projection(topology: CountiesTopology, layout?: typeof MAP_LAYOUT): GeoProjection` exported from `buildMapPaths.ts` and used by both builders.
  - `buildStateBorders(topology: CountiesTopology, layout?: typeof MAP_LAYOUT): string` — one SVG path `d`.
  - `CountyMap` gains the prop `stateBorders: string`.

- [ ] **Step 1: Failing layout tests** in `buildMapPaths.test.ts`

```ts
test("Alaska's block is at least twice its old area share", () => {
  const [[x0, y0], [x1, y1]] = MAP_LAYOUT.inset;
  const share = ((x1 - x0) * (y1 - y0)) / (MAP_LAYOUT.width * MAP_LAYOUT.height);
  expect(share).toBeGreaterThanOrEqual(2 * ((320 * 284) / (960 * 600)));
});
test("the two blocks do not overlap", () => {
  expect(MAP_LAYOUT.inset[1][0]).toBeLessThan(MAP_LAYOUT.main[0][0]);
});
```

The two existing "lands inside" tests keep their assertions against the new extents.

- [ ] **Step 2: Failing halo tests**

```ts
const MIN = 26; // canvas units; 24 CSS px or more once the map is drawn 1000px wide or wider
test("a roomy, solid county gets no halo", () => {
  expect(haloWidth([[0, 0], [60, 40]], 2000)).toBe(0);
});
test("a county narrower than the minimum gets the shortfall, at least 12", () => {
  expect(haloWidth([[0, 0], [60, 10]], 500)).toBe(16);
  expect(haloWidth([[0, 0], [60, 20]], 1100)).toBe(12);
});
test("a sparse island chain gets a halo even when its box is large", () => {
  // fill ratio = area / box area < 0.15
  expect(haloWidth([[0, 0], [200, 60]], 300)).toBe(16);
});
test("Aleutians East and West get halos from the real topology", () => {
  const byFips = new Map(buildMapPaths(topology).map((p) => [p.fips, p]));
  expect(byFips.get("02013")!.halo).toBeGreaterThan(0);
  expect(byFips.get("02016")!.halo).toBeGreaterThan(0);
});
```

Rule: `minSide < MIN` → `max(MIN - minSide, 12)`; else fill ratio `< 0.15` → `16`; else `0`. Bounds and area come from `geoPath(projection).bounds(f)` and `.area(f)`. The last test uses the fixture topology if it contains both FIPS; otherwise assert on a synthetic multi-island feature.

- [ ] **Step 3: Failing border tests** in `buildStateBorders.test.ts`

```ts
test("returns a non-empty path inside the main extent", () => { /* d starts with "M"; every coordinate within MAP_LAYOUT.main */ });
test("a topology with one state has no borders", () => { expect(buildStateBorders(oneStateTopology)).toBe(""); });
```

- [ ] **Step 4: Run** `cd web && npx vitest run src/map` — expect the new tests to fail.

- [ ] **Step 5: Implement** the layout constants, `haloWidth`, `lower48Projection`, the `halo` field, and `buildStateBorders` using `mesh(topology, topology.objects.counties, (a, b) => a !== b && a.properties.state !== b.properties.state)` projected with `lower48Projection`. Alaska's projection parameters (`rotate 154`, parallels `[55, 65]`) are unchanged.

- [ ] **Step 6: Failing `CountyMap` tests**

```ts
test("draws a halo path under the counties for each county that has one", () => {
  // paths with halo > 0 → one `path.county-halo[data-fips]` each, inside a <g class="map-halos"> that precedes .map-main
});
test("a halo click selects its county", async () => { /* click path.county-halo[data-fips="02016"] → onSelect("02016") */ });
test("the selected county has a ring under it with the same d", () => { /* path.county-ring */ });
test("state borders are drawn above the counties and ignore the pointer", () => {
  // path.state-borders has the given d, follows .map-main in the DOM, and has no data-fips
});
```

- [ ] **Step 7: Implement in `CountyMap.tsx` and `styles.css`.** Halos: same `d`, `fill` and `stroke` transparent, `stroke-width` = `halo`, `pointer-events: all`, ordered widest first so the smallest county's halo is on top, all below every visible county. `.county-ring`: `fill: none; stroke: var(--map-selected-under); stroke-width: 4.5`. `.state-borders`: `fill: none; stroke: var(--map-state-border); stroke-width: 1.5; pointer-events: none`. Add the tokens to `:root`: `--map-state-border: #17252a; --map-selected: #000; --map-selected-under: #fff`. `.inset-label` font-size becomes 14 canvas units.

- [ ] **Step 8: Pass `stateBorders`** from `Explorer.tsx` (`useMemo(() => buildStateBorders(topology), [topology])`).

- [ ] **Step 9: Run** `npm test && npm run lint && npm run typecheck`; then the e2e suite with `CI=1`. Expect all green; fix any e2e that assumed the 960×600 canvas.

- [ ] **Step 10: Commit** `feat(web): larger Alaska, state borders and hit halos on the map`.

---

### Task 2: URL and measure model — `show`, categories, legacy `mode`

**Files:**
- Create: `web/src/explorer/categories.ts`, `web/src/explorer/categories.test.ts`
- Modify: `web/src/explorer/parseParams.ts`, `useExplorerParams.ts`, `Explorer.tsx`, and their tests

**Interfaces:**
- Produces:
  - `type MeasureGroup = "indicators" | "demographics" | "outcomes"`
  - `GROUPS: readonly { id: MeasureGroup; label: string }[]` in that order.
  - `groupOf(category: string): MeasureGroup` — `"Demographics"` → `demographics`, `"Outcomes"` → `outcomes`, anything else → `indicators`.
  - `measuresIn(indicators: Indicator[], group: MeasureGroup): { heading: string; items: Indicator[] }[]` — one entry per manifest category in the group, in manifest order.
  - `type ExplorerParams = { indicator: string; county: string | null; target: string; show: "observed" | "expected"; view: "map" | "table"; canonical: string | null }` — `canonical` is the corrected query string when the given one has an invalid or legacy key, else `null`. It replaces `invalid`.
  - `useExplorerParams(...)` returns `{ params, setIndicator, setCounty, setTarget, setView, setShow }`; `setMode` is removed.

- [ ] **Step 1: Failing `categories.test.ts`**

```ts
test("groupOf maps the five manifest categories", () => {
  expect(["Social & Economic", "Access", "Behaviors"].map(groupOf)).toEqual(["indicators", "indicators", "indicators"]);
  expect(groupOf("Demographics")).toBe("demographics");
  expect(groupOf("Outcomes")).toBe("outcomes");
});
test("an unknown category falls under indicators", () => { expect(groupOf("Housing")).toBe("indicators"); });
test("measuresIn keeps manifest order and one heading per category", () => { /* against the fixture manifest */ });
```

- [ ] **Step 2: Failing `parseParams.test.ts` cases** (replace the `mode` tests)

```ts
const parse = (q: string) => parseParams(q, manifest, fips, ["life_expectancy", "premature_death", "injury_deaths"]);
test("show=expected is kept on a model target", () => {
  const p = parse("i=premature_death&show=expected");
  expect(p).toMatchObject({ indicator: "premature_death", target: "premature_death", show: "expected", canonical: null });
});
test("show=expected on a measure with no model is dropped", () => {
  expect(parse("i=poverty_rate&show=expected")).toMatchObject({ show: "observed", canonical: "i=poverty_rate" });
});
test("a model target drops t", () => {
  expect(parse("i=life_expectancy&t=injury_deaths")).toMatchObject({ target: "life_expectancy", canonical: "i=life_expectancy" });
});
test("t picks the panel's outcome on other measures", () => {
  expect(parse("i=poverty_rate&t=injury_deaths")).toMatchObject({ target: "injury_deaths", canonical: null });
});
test("legacy mode=model becomes the target in Compared with expected, keeping c and view", () => {
  expect(parse("mode=model&t=injury_deaths&c=53033&view=table").canonical)
    .toBe("c=53033&view=table&i=injury_deaths&show=expected");
});
test("legacy mode=model with no t uses the default target", () => {
  expect(parse("i=poverty_rate&mode=model")).toMatchObject({ indicator: "life_expectancy", show: "expected" });
});
test("mode=values is dropped and nothing else changes", () => {
  expect(parse("i=poverty_rate&mode=values").canonical).toBe("i=poverty_rate");
});
```

`canonical` is built by copying the given `URLSearchParams`, deleting invalid and superseded keys, then setting any new ones, so key order is: surviving keys in their given order, then added keys.

- [ ] **Step 3: Run** `npx vitest run src/explorer` — expect failures.

- [ ] **Step 4: Implement** `categories.ts`, the new `parseParams`, and the hook. The hook's effect becomes: when `params.canonical !== null`, `setSearchParams(new URLSearchParams(params.canonical), { replace: true })`. `setIndicator(id)` also deletes `show` when `id` is not a target, and deletes `t` when it is. `setShow("observed")` deletes the key.

- [ ] **Step 5: Update `Explorer.tsx`** to derive `const compared = params.show === "expected"` wherever it read `modelMode`. In the left column, replace the Values/Model buttons with the Observed / Compared with expected pair (same `aria-pressed` buttons for now), rendered only when `targetIds.includes(params.indicator)`. Remove `OutcomePicker` from the column and delete `OutcomePicker.tsx` and its test; the indicator list is always shown. Between this task and Task 5 the panel's outcome on non-target measures is only settable by URL.

- [ ] **Step 6: Update `Explorer.test.tsx` and `useExplorerParams.test.tsx`**: tests that clicked "Model" now select a target then click "Compared with expected"; the two Outcome-select tests are deleted; add

```ts
test("an old model link is rewritten in place", async () => {
  // render at "/?mode=model&t=injury_deaths&c=53033&view=table"
  // → heading "Injury deaths: compared with expected", a ModelTable, the panel for King County,
  //   and location.search === "?c=53033&view=table&i=injury_deaths&show=expected"; history length unchanged
});
test("leaving a modelled outcome returns to Observed", async () => { /* choose Poverty rate → no show in URL, no switch */ });
```

- [ ] **Step 7: Update e2e** `smoke.spec.ts` model tests and `a11y.spec.ts` URLs to the new form; keep one `?mode=model` navigation in `smoke.spec.ts` asserting the rewrite. Update `web/scripts/screenshot.mjs` to `?i=life_expectancy&show=expected&c=53033`.

- [ ] **Step 8: Run** unit, lint, typecheck and e2e. **Commit** `feat(web): show parameter and measure groups replace model mode`.

---

### Task 3: Toolbar, measure picker and the fixed stage

**Files:**
- Create: `web/src/explorer/MeasurePicker.tsx`, `MeasurePicker.test.tsx`, `web/e2e/stage.spec.ts`, `web/src/components/ui/{toggle-group,toggle,popover,command}.tsx`
- Delete: `web/src/explorer/IndicatorPicker.tsx`, `IndicatorPicker.test.tsx`
- Modify: `web/src/explorer/Explorer.tsx`, `Explorer.test.tsx`, `web/src/styles.css`, `web/e2e/{smoke,mobile,a11y}.spec.ts`

**Interfaces:**
- Consumes: `GROUPS`, `groupOf`, `measuresIn` (Task 2); `setShow`, `setView`.
- Produces: `MeasurePicker({ indicators, selectedId, onSelect }: { indicators: Indicator[]; selectedId: string; onSelect: (id: string) => void })`.

Accessible names: category group "Measure category"; picker button `Measure: {label}`; filter input "Filter measures"; show group "Show"; view group "View"; phone description button "About this measure". Radix single ToggleGroups expose `role="radio"` items.

- [ ] **Step 1:** `npx shadcn@latest add toggle-group popover command -y`; restyle onto tokens; apply the import check from Global Constraints. ToggleGroup items reuse the `segment` look from `button.tsx`, keyed on `data-state="on"`.

- [ ] **Step 2: Failing `MeasurePicker.test.tsx`**

```ts
test("the category of the selected measure is checked", () => { /* selectedId poverty_rate → radio "Indicators" checked */ });
test("the list shows only the category's measures, under its headings", async () => {
  // open → headings "Social & Economic", "Access", "Behaviors"; no option "Diabetes"
});
test("typing filters; Enter selects and closes; focus returns to the button", async () => {});
test("no match shows 'No measures match'", async () => {});
test("switching category selects its first measure", async () => { /* click "Outcomes" → onSelect(first Outcomes id) */ });
test("switching back selects the measure last viewed there, and clears the filter", async () => {});
test("Escape closes the popover and does not bubble", async () => { /* a document keydown spy sees defaultPrevented or nothing */ });
```

- [ ] **Step 3: Implement `MeasurePicker`.** The category is `groupOf` of the selected measure's category. Last-viewed ids live in a `useRef<Partial<Record<MeasureGroup, string>>>`, updated whenever `selectedId` changes. Use `Command` with its built-in filtering on the label.

- [ ] **Step 4: Failing `Explorer.test.tsx` changes**: no element with class `explorer-picker`; the toolbar holds the picker, county search and the "View" group; the "Show" group exists only on targets; the legend is inside `.map-stage`; the hint "Select a county for its details" shows with no `c` and is gone with one; on a phone viewport the description is not in the document until "About this measure" is pressed.

- [ ] **Step 5: Rebuild the layout in `Explorer.tsx` and `styles.css`** per §4. `.explorer` is a single column. `.map-stage` has `height: max(480px, calc(100dvh - var(--stage-top)))` where `--stage-top` is set from the stage's measured page offset by a `useLayoutEffect` + `ResizeObserver` on the toolbar and title block; the SVG uses `preserveAspectRatio="xMinYMid meet"` and fills the stage. The legend is absolutely positioned at the stage's top left from 721px, and below the map on phones. Remove the `.picker*`, `.explorer-picker` and `.view-toggle` rules that no longer apply.

- [ ] **Step 6: `e2e/stage.spec.ts`**

```ts
for (const size of [{ width: 1440, height: 900 }, { width: 900, height: 800 }, { width: 375, height: 812 }]) {
  test(`the map keeps its box when a county opens at ${size.width}×${size.height}`, async ({ page }) => {
    // goto ?i=poverty_rate; box = .county-map svg boundingBox(); click path[data-fips="53033"]; expect same box (±0.5)
  });
}
test("at 1440×900 the map is at least 1000px wide and fully in view; Alaska's frame is at least 181,760 px²", …);
test("at 375×812 the map starts within 330px of the top", …);
test("every county has a 24px pointer target at 1440×900", async ({ page }) => {
  // for each fips: union box of path.county and its path.county-halo (stroke included) ≥ 24 on both sides
});
```

Run the phone case under the `mobile` project and the rest under `chromium` (add `stage.spec.ts` to both `testMatch`/`testIgnore` lists in `playwright.config.ts` as needed).

- [ ] **Step 7:** Update the other e2e specs for the new controls (the phone picker-disclosure tests become measure-popover tests). **Run** everything. **Commit** `feat(web): toolbar measure picker and a fixed map stage`.

---

### Task 4: County search on Combobox

**Files:**
- Create: `web/src/search/matchCounties.ts`, `matchCounties.test.ts`
- Modify: `web/src/search/CountySearch.tsx`, `CountySearch.test.tsx`

**Interfaces:**
- Produces: `matchCounties(counties: County[], text: string, max = 8): County[]` — label matches first, then state-name matches, as today.
- `CountySearch` keeps its props `{ counties, onSelect(fips, opener), inputId? }`, its `role="combobox"` input, the placeholder and the `status` text.

- [ ] **Step 1:** Move the matching rules into `matchCounties` with tests carried over from `CountySearch.test.tsx` (the "Washington keeps Washington County within the cap" case included). Run, see them fail, implement, pass.
- [ ] **Step 2:** Rebuild `CountySearch` on `Command` with `shouldFilter={false}`, fed by `matchCounties`, inside a `Popover` anchored to the input that opens only when there are options or a no-match message. Keep: `onSelect` receives the input element as opener; choosing clears the text; Escape closes the list first.
- [ ] **Step 3:** Adjust `CountySearch.test.tsx` only where roles or ids changed; the skip-link tests in `Explorer.test.tsx` must pass unchanged.
- [ ] **Step 4:** Run unit and e2e. **Commit** `refactor(web): county search on the shared combobox`.

---

### Task 5: Floating panel, phone drawer and the card's outcome select

**Files:**
- Create: `web/src/panel/PanelShell.tsx`, `PanelShell.test.tsx`, `web/src/components/ui/{dialog,drawer,select}.tsx`
- Modify: `web/src/panel/CountyPanel.tsx`, `ModelCard.tsx`, `web/src/explorer/Explorer.tsx`, their tests, `web/src/styles.css`, `web/e2e/{mobile,smoke,a11y,stage}.spec.ts`

**Interfaces:**
- Consumes: `setTarget` (Task 2).
- Produces:
  - `PanelShell({ onClose, children }: { onClose: () => void; children: ReactNode })` — a non-modal Radix Dialog from 721px, a vaul Drawer (`modal={false}`, `snapPoints={[0.4, 0.85]}`, opening at `0.4`) on phones. Both carry `className="county-panel"` on their content and a visually hidden title "County details".
  - `ModelCard` gains optional props `targets?: { id: string; label: string }[]` and `onTargetChange?: (id: string) => void`. When both are given it renders a Radix Select labelled "Outcome" in its heading row.
  - `CountyPanel` gains `targets` and `onTargetChange`, passed through only when the selected measure is not a model target.

- [ ] **Step 1:** `npx shadcn@latest add dialog drawer select -y`; restyle; import check. Remove the Dialog overlay element from the non-modal use.

- [ ] **Step 2: Failing `PanelShell.test.tsx`**

```ts
test("is a dialog named County details", () => { expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument(); });
test("a pointer press outside does not close it", async () => { /* click document.body → onClose not called */ });
test("Escape closes it", async () => { /* onClose called once */ });
test("opening does not move focus", () => { /* document.activeElement is unchanged after render */ });
test("phone: renders the drawer, with no Expand button", () => { /* matchMedia phone → no button named Expand */ });
```

- [ ] **Step 3: Implement `PanelShell`.** `onInteractOutside={(e) => e.preventDefault()}`, `onOpenAutoFocus={(e) => e.preventDefault()}`, `onCloseAutoFocus={(e) => e.preventDefault()}` (the Explorer's own `onClosePanel` restores focus). Dragging the drawer below its lowest snap point calls `onClose`.

- [ ] **Step 4: Update `CountyPanel`** to render inside `PanelShell`: drop the `<aside>`, the document `keydown` listener, the `expandedFips` state, the Expand button and the `county-panel--sheet`/`--expanded` classes. The county `h2`, its focus handling and the Close button stay.

- [ ] **Step 5: Failing tests for the card select and Explorer behaviour**

```ts
// ModelCard.test.tsx
test("with targets, an Outcome select changes the target", async () => { /* choose "Injury deaths" → onTargetChange("injury_deaths") */ });
test("without targets there is no Outcome select", () => {});
// Explorer.test.tsx
test("the panel is a dialog and the map stays live: a second county replaces the first", async () => {});
test("on a non-target measure the card's Outcome select sets t; on a target there is none", async () => {});
test("Escape with the measure popover open closes the popover and keeps the county", async () => {});
```

Existing focus tests (search → heading, map click leaves focus alone, close returns to opener or title) keep their assertions, with `complementary` queries changed to `dialog`.

- [ ] **Step 6: CSS.** From 721px `.county-panel` is `position: absolute; top: 12px; right: 12px; bottom: 12px; width: 400px` inside the stage (map view) with its own scroll and a shadow; in table view the panel is positioned the same way over the table area and `.county-table-wrap` gets `margin-right: 412px` while a county is selected. Delete the old three-column and sheet rules.

- [ ] **Step 7: e2e.** `mobile.spec.ts`: tap a county → drawer at the 40% snap; drag the handle up → 85%; the header stays in view while the drawer scrolls; Close closes. `stage.spec.ts`: add "at 900×800 the open panel is inside the viewport". `smoke.spec.ts` and `a11y.spec.ts`: `complementary` → `dialog`.

- [ ] **Step 8:** Run everything. **Commit** `feat(web): county panel floats over the map; drawer on phones`.

---

### Task 6: Dark mode

**Files:**
- Create: `web/src/theme/theme.ts`, `theme.test.ts`, `ThemeProvider.tsx`, `ThemeMenu.tsx`, `ThemeMenu.test.tsx`, `web/src/color/palette.ts`, `web/src/components/ui/dropdown-menu.tsx`
- Modify: `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/src/color/{outline,makeColorScale,HatchSwatch}.ts(x)`, `web/src/model/modelView.ts`, `web/src/map/CountyMap.tsx`, `web/src/map/outlineContrast.test.ts`, `web/src/panel/{ShapBars,ResidualRange,StripPlot}.tsx`, callers of `tierFill`/`outlineFor`

**Interfaces:**
- Produces:
  - `type ThemeChoice = "light" | "dark" | "system"`; `type Theme = "light" | "dark"`; `STORAGE_KEY = "pnw-theme"`.
  - `readChoice(): ThemeChoice` (never throws; anything but the three values → `"system"`), `writeChoice(c: ThemeChoice): void` (never throws), `resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme`.
  - `useTheme(): { choice: ThemeChoice; theme: Theme; setChoice(c: ThemeChoice): void }` from `ThemeProvider`, which toggles the `dark` class on `document.documentElement`.
  - `type Palette = { tierNone: string; hatchBackground: string; hatchLine: string; stage: string }`; `PALETTES: Record<Theme, Palette>`; `usePalette(): Palette`.
    Light: `#e3e3e3`, `#f2f2f2`, `#999999`, `#ffffff`. Dark starting values: `#4b555a`, `#2a3236`, `#6f7b80`, `#161d20` (tune only within the tests below).
  - `tierFill(flag: Flag, palette: Palette): string`; `outlineFor(fill: string, palette: Palette): string`; `HATCH_BACKGROUND` is removed in favour of `palette.hatchBackground`.

- [ ] **Step 1: Failing `theme.test.ts`**

```ts
test("readChoice returns system when storage is empty, holds a bad value, or throws", () => {
  // empty; localStorage["pnw-theme"] = "purple"; a getItem that throws
});
test("writeChoice swallows a storage error", () => {});
test("resolveTheme", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
});
```

- [ ] **Step 2: Failing `ThemeMenu.test.tsx`**: a button named "Theme" opens three `menuitemradio`s "Light", "Dark", "System" with System checked by default; choosing Dark adds `dark` to `<html>` and stores `dark`; with a throwing storage, choosing Dark still adds the class.

- [ ] **Step 3: Extend `outlineContrast.test.ts`** to run its fill table once per palette (`describe.each(Object.entries(PALETTES))`): every outline ≥ 3:1 against its fill; `DEFAULT_OUTLINE` ≥ 3:1 against `palette.stage`; `palette.hatchLine` ≥ 3:1 against `palette.hatchBackground` is **not** required (it is texture), but `outlineFor(HATCH_FILL, palette)` ≥ 3:1 against `palette.hatchBackground` is. Add: the five ramp bins and four colored tiers are identical across palettes.

- [ ] **Step 4:** `npx shadcn@latest add dropdown-menu -y` (restyle, import check). **Implement** theme files, `palette.ts`, and thread `palette` through `tierFill`, `outlineFor`, `HatchSwatch`, `CountyMap`'s pattern, `ModelLegend`, `ModelTable`, `ModelCard`, `ResidualRange` and `Explorer`. Add `ThemeMenu` at the right end of the header (Lucide `Sun`, `Moon`, `Monitor`).

- [ ] **Step 5: `index.html`** — before the app script:

```html
<script>
  (function () {
    var c = "system";
    try { c = localStorage.getItem("pnw-theme") || "system"; } catch (e) {}
    var dark = c === "dark" || (c !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  })();
</script>
```

- [ ] **Step 6: Tokens.** In `styles.css` add `@custom-variant dark (&:where(.dark, .dark *));` and a `.dark { … }` block redefining every `:root` color token, plus `--map-state-border`, `--map-selected`, `--map-selected-under`, and new chart tokens `--chart-ink`, `--chart-muted`, `--chart-band-75`, `--chart-band-90`. `.map-stage` background becomes `var(--stage)` set from the palette's `stage` value. Text tokens must be 4.5:1 on their surfaces; `--line-strong` and `--map-state-border` 3:1.

- [ ] **Step 7: Charts.** Replace hard-coded `fill`/`stroke` hex attributes in `ShapBars`, `ResidualRange`, `StripPlot`, the race-breakdown and who-lives-here CSS, the inset frame and label, and the map hover stroke with the chart tokens or `currentColor`. `StripPlot` adds `theme` to its effect dependencies so Plot redraws. Update tests that asserted the old hex attributes to assert the class or token instead.

- [ ] **Step 8:** Run unit, lint, typecheck, e2e. Check both themes in the browser at 1440×900 and 375×812. **Commit** `feat(web): dark mode`.

---

### Task 7: Remaining Radix swaps and docs

**Files:**
- Modify: `web/src/pages/methodology/ModelSection.tsx` and test, `web/src/pages/About.tsx` and test, `README.md`, `docs/images/explorer.png`, `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md` (§6), `docs/superpowers/specs/2026-11-11-m5-model-ui-design.md`, `2026-11-11-m6-methodology-polish-design.md`, `2026-11-11-m7-web-a11y-polish-design.md`
- Delete: `web/src/components/ui/native-select.tsx`

- [ ] **Step 1:** Swap the methodology Outcome select to the Radix `Select` from Task 5; update `ModelSection.test.tsx` (`selectOptions` → open and click the option).
- [ ] **Step 2:** Delete `native-select.tsx`. Verify: `grep -rn "<select\|NativeSelect\|aria-pressed" web/src --include=*.tsx | grep -v test` prints nothing.
- [ ] **Step 3:** Rewrite About's "How to use it" list for the toolbar, the Observed / Compared with expected switch and the theme menu; update `About.test.tsx`. Verify: `grep -rni "values mode\|model mode" web/src README.md` prints nothing.
- [ ] **Step 4:** Apply the spec changes in §11, each as a short dated note pointing to the M11 design. Update README "What it does" and regenerate the screenshot with `npm run screenshot`.
- [ ] **Step 5:** Run unit, lint, typecheck, e2e. **Commit** `docs: explorer redesign in the specs, README and About; methodology select on Radix`.

---

### Task 8: Accessibility pass

**Files:**
- Modify: `web/e2e/a11y.spec.ts`, `web/playwright.config.ts` if needed
- Create: `web/e2e/keyboard.spec.ts`

- [ ] **Step 1: `a11y.spec.ts`** — keep `audit()` as is (serious and critical, WCAG 2.1 A and AA). Run it for each state below in both themes (set `localStorage["pnw-theme"]` with `page.addInitScript` before `goto`), on both projects:
  `?i=poverty_rate` · `?i=life_expectancy&show=expected` · `?i=poverty_rate&view=table` · `?i=poverty_rate&c=53033` · `?i=life_expectancy&c=53077` · `?i=life_expectancy&show=expected&c=53077` · measure popover open · county search list open · theme menu open · `/methodology` · `/about`.

- [ ] **Step 2: `keyboard.spec.ts`** (chromium, keyboard only, no pointer):

```ts
test("the explorer can be driven end to end from the keyboard", async ({ page }) => {
  // Tab → skip link → Enter → county search focused
  // reach "Measure category", arrow to Outcomes; open "Measure: …", type "life", Enter → title "Life expectancy"
  // reach "Show", choose "Compared with expected" → URL has show=expected
  // county search: type "Yakima", ArrowDown, Enter → dialog "County details", focus on heading "Yakima County"
  // Tab to a similar-county button, Enter → heading changes and has focus
  // Escape → dialog gone, focus on the county search input
  // reach "Theme", choose Dark → <html> has class "dark"
  // every focused element along the way has a visible outline (computed outline-style !== "none")
});
test("phone: every toolbar control and the drawer's Close are at least 44×44", …); // mobile project
```

- [ ] **Step 3:** Fix what the two specs find, in the owning component, with a unit test where the fault is in logic.
- [ ] **Step 4:** Run the full suite with `CI=1` on all three Playwright projects. **Commit** `test(web): accessibility pass for the redesigned explorer`.
- [ ] **Step 5:** Milestone review: fill in the milestone PR template with every issue PR, `Closes #…` lines and the exit-criteria evidence from spec §2, then mark it ready for the author.
