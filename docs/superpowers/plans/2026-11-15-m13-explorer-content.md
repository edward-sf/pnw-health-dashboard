# M13 Explorer Content Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tidy the Explorer's copy and pare the county panel back to what earns its place, as the author decided section by section.

**Architecture:**
- **Copy changes** go where the copy lives: `indicators.yaml` for labels and the panel components for panel text.
- **Colour logic** sits in `web/src/model/modelView.ts` as pure functions, so both directions are unit-tested.
- **One shared `InfoTip` component** replaces every explanatory paragraph that moves behind an ⓘ.

**Tech Stack:** React 19, Vite, Tailwind v4 tokens (`web/src/styles.css`), Radix popover, Observable Plot (strip plot), Vitest, Playwright, plus the Python pipeline (`indicators.yaml`, pytest).

**Spec:** `docs/superpowers/specs/2026-11-15-m13-explorer-content-design.md`

## Global Constraints

- **Data colours never move:**
  - tier fills `#ca0020`, `#f4a582`, `#92c5de` and `#0571b0` (`TIER_FILLS`), plus `palette.tierNone`;
  - red and blue mean less and more favorable, mapped by the outcome's direction.
- **Model copy:**
  - Say "associated with", never "causes".
  - Tier labels come from `tierLabel(flag, direction)`.
- **Tokens only.** `web/src/test/tokenUsage.test.ts` sweeps every `.tsx` file under `web/src`. Colours come from tokens, `TIER_FILLS` or the palette, never literals in components.
- **Contrast:** chart marks need 3:1 against `--surface` in both themes, and text needs 4.5:1.
- **Explorer layout:** the title block's height must not depend on the measure, so the map never moves (`web/e2e/stage.spec.ts`).
- **Labels:** spec Appendix A is the label record. A label change updates it in the same PR, and `pipeline/tests/test_sensitivity_review.py` stays green.
- **E2E specs** import `test` and `expect` from `./fixtures`, and wait on conditions, never on sleeps.
- **The full model card shows in both Observed and Compared modes.** No new panel modes or state.

## Review Focus

1. **A `higher_is_worse` outcome (Premature death)** must flip the range chart's red side and every factor bar's colour against Life expectancy. → Tests in Task 4, step 1.
2. **A county with no state rank** (where `state_rank` is null) must still read `10/139 counties`, with no parenthesis and no "undefined". → Task 3, step 1.
3. **A factor with zero contribution, and the "All other factors" bar,** must stay neutral, never red or blue. → Task 4, step 1.
4. **Compared mode at the narrowest panel width (320px phone)** must not overflow the similar-counties table or the model figures. → Task 7, step 1.
5. **A county with no model result** must still show the card heading and its ⓘ, but no figures, no chart and no factors. → Task 4, step 1.

---

### Task 1: Shared InfoTip and the Explorer heading

**Files:**
- Create: `web/src/components/ui/info-tip.tsx`, `web/src/components/ui/info-tip.test.tsx`
- Modify: `web/src/explorer/Explorer.tsx` (title block, about lines 221–245), `web/src/explorer/Explorer.test.tsx`, `web/src/styles.css` (`.indicator-description--clamped`, `.title-block`)

**Interfaces:**
- Produces: `InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }): JSX.Element`. It renders a ghost, icon-size `Button` with `aria-label={label}` and the Lucide `Info` icon. It opens a `Popover` whose content has the class `info-tip-content` and the width the Explorer uses today (`w-[min(20rem,calc(100vw-2rem))] text-sm`). The guard allows that arbitrary width because it uses `min()`, not px or rem.

- [ ] **Step 1: Write the failing tests**

```tsx
// info-tip.test.tsx
test("InfoTip is a named button that reveals its content", async () => {
  render(<InfoTip label="About this measure"><p>Details</p></InfoTip>);
  expect(screen.queryByText("Details")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "About this measure" }));
  expect(await screen.findByText("Details")).toBeVisible();
});
// Explorer.test.tsx
test("the measure description appears only behind About this measure", async () => {
  // render the Explorer at desktop width for life_expectancy, as the existing tests do
  expect(document.querySelector(".indicator-description--clamped")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "About this measure" }));
  expect(await screen.findByText("Average number of years a person can expect to live.")).toBeVisible();
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd web && npx vitest run src/components/ui/info-tip.test.tsx src/explorer/Explorer.test.tsx`
Expected: FAIL. The `InfoTip` module is not found, and `.indicator-description--clamped` is present.

- [ ] **Step 3: Implement `InfoTip`, and use it in the Explorer**

Replace the Explorer's inline `Popover` with `<InfoTip label="About this measure" className="about-measure">`. Delete the `!isPhone` clamped paragraph and its CSS. Then fix `.title-block` so it is the same height for every measure. Its height is set today by the clamped two-line description, so give it a fixed `min-height` that covers the heading row and the meta row.

- [ ] **Step 4: Run the unit tests and the stage e2e**

Run: `cd web && npx vitest run && npm run build && CI=1 npx playwright test e2e/stage.spec.ts e2e/keyboard.spec.ts`
Expected: PASS. The stage test ("the map never moves") still holds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/info-tip.tsx web/src/components/ui/info-tip.test.tsx web/src/explorer web/src/styles.css
git commit -m "feat(web): shared InfoTip; measure description only behind About this measure"
```

### Task 2: Short race and ethnicity labels

**Files:**
- Modify: `pipeline/src/pnw_health/indicators.yaml` (labels at lines 437, 450, 463, 476, 489 and 502), `pipeline/tests/test_indicators.py`, `docs/superpowers/specs/2026-11-14-m13-branding-design.md` (Appendix A rows `pct_white`, `pct_black`, `pct_aian`, `pct_asian`, `pct_nhpi`, `pct_two_or_more`, or whatever id the `Two or more races` row uses), and `web/src/test/fixtures/*` wherever a fixture copies these labels

**Interfaces:**
- Produces: the indicator labels `White`, `Black`, `American Indian and Alaska Native`, `Asian`, `Native Hawaiian and Pacific Islander`, `Two or more races`. `pct_hispanic` keeps `Hispanic or Latino (any race)`, and every description is unchanged.

- [ ] **Step 1: Write the failing test**

```python
# test_indicators.py
def test_race_share_labels_are_short_and_descriptions_keep_the_definition() -> None:
    by_id = {i.id: i for i in load_catalog()}
    race = [i for i in by_id.values() if i.profile == "race"]
    assert by_id["pct_hispanic"].label == "Hispanic or Latino (any race)"
    for ind in race:
        assert "not Hispanic" not in ind.label
        if ind.id != "pct_hispanic":
            assert "not Hispanic or Latino" in ind.description
```

(`load_catalog` is in `pnw_health.indicators`.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd pipeline && uv run pytest tests/test_indicators.py -k race_share -v`
Expected: FAIL on `"not Hispanic" not in ind.label`.

- [ ] **Step 3: Shorten the six labels in `indicators.yaml`**

Then update Appendix A. Each affected row's decision becomes **Change label** to the short form, with the note: "Principle 3: the definition stays in the description and the Who lives here ⓘ (2026-11-15 content review)."

- [ ] **Step 4: Run the pipeline checks**

Run: `cd pipeline && uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src`
Expected: PASS, including `test_sensitivity_review.py`.

- [ ] **Step 5: Commit**

```bash
git add pipeline docs/superpowers/specs web/src/test/fixtures
git commit -m "feat(pipeline): short race and ethnicity labels; definition stays in descriptions"
```

### Task 3: Panel header and measure section

**Files:**
- Modify: `web/src/panel/CountyPanel.tsx`, `web/src/panel/CountyPanel.test.tsx`, `web/src/panel/rankSummary.ts`, `web/src/panel/rankSummary.test.ts`, `web/src/panel/StripPlot.tsx`, `web/src/panel/StripPlot.test.tsx`, `web/src/styles.css` (`.panel-header`, `.panel-ci`, `.strip-plot*`), `web/e2e/smoke.spec.ts` (race-breakdown test, line 178 on), `web/e2e/a11y.spec.ts` (lines 66 and 74), `web/src/pages/methodology/RaceBreakdownSection.tsx`
- Keep: `RaceBreakdown.tsx` and its test. Nothing renders it any more, but the Atlas page will.

**Interfaces:**
- Produces:
  - `rankSummary(fips: string, entries: Record<string, ValueEntry>, counties: County[]): { text: string; label: string } | null`;
  - the `.panel-ranks` element shows `text`, and carries `aria-label={label}` and `title={label}`.

- [ ] **Step 1: Write the failing tests**

```ts
// rankSummary.test.ts (fixture: rank 10 of 139 ranked, state_rank 3 of 39 in WA)
expect(rankSummary(...)).toEqual({
  text: "10/139 counties (3rd in WA)",
  label: "10th most favorable of 139 counties, 3rd of 39 in Washington",
});
// state_rank null
expect(rankSummary(...)).toEqual({ text: "10/139 counties", label: "10th most favorable of 139 counties" });
```
```tsx
// CountyPanel.test.tsx
expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("King County, WA");
expect(document.querySelector(".panel-state")).toBeNull();
expect(document.querySelector(".panel-ci")).toBeNull();
expect(screen.queryByRole("region", { name: /By race and ethnicity/ })).toBeNull(); // both modes
expect(screen.getByLabelText("10th most favorable of 139 counties, 3rd of 39 in Washington")).toHaveTextContent("10/139 counties (3rd in WA)");
// StripPlot.test.tsx
const sel = container.querySelector("[data-selected]")!;
expect(sel.getAttribute("fill")).toBe("var(--evergreen)");
expect(sel.getAttribute("stroke")).toBe("var(--surface)");
expect(container.querySelector("[data-selected-rule]")!.getAttribute("stroke")).toBe("var(--evergreen)");
```

(Adapt the fixture values to the test file's existing counties. The assertions are what matter.)

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd web && npx vitest run src/panel`
Expected: FAIL on each assertion above.

- [ ] **Step 3: Implement**

- **Header:** the heading reads `{county.name}, {county.state}`, on one line.
- **Measure section:** remove the CI paragraph and both `RaceBreakdown` renders.
- **`rankSummary`:** returns `{ text, label }`, using `STATE_NAMES` for the label.
- **`StripPlot`:**
  - Mark the selected dot with `fill: "var(--evergreen)"`, `stroke: "var(--surface)"`, `strokeWidth: 2` and `r: 5`.
  - Add a `Plot.ruleX` at its value, `stroke: "var(--evergreen)"`, spanning the strip's height.
  - Lower the other dots' `fillOpacity` to 0.45.
  - Set `data-selected` and `data-selected-rule` through Plot's `render` hook or `ariaDescription`, or select by a class you add. Do whichever is simplest, provided the test can find both marks.
  - The visually hidden sentence stays.
- **E2E:** delete the race-breakdown smoke test and the two a11y assertions.
- **Methodology:** in `RaceBreakdownSection.tsx`, reword any sentence that says the breakdown appears in the county panel. It should say the breakdowns are part of the exported data, and leave out where they're shown.

- [ ] **Step 4: Run the unit tests, lint and typecheck**

Run: `cd web && npx vitest run && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): leaner panel measure section; rank as 10/139; selected county stands out on the strip"
```

### Task 4: Model card

**Files:**
- Modify: `web/src/model/modelView.ts`, `web/src/model/modelView.test.ts`, `web/src/panel/ModelCard.tsx`, `web/src/panel/ModelCard.test.tsx`, `web/src/panel/ResidualRange.tsx`, `web/src/panel/ResidualRange.test.tsx`, `web/src/panel/ShapBars.tsx`, `web/src/panel/ShapBars.test.tsx`, `web/src/styles.css` (`.model-*`, `.range-band-*`, `.shap-bar`), `web/e2e/smoke.spec.ts` (line 87, the factors heading)

**Interfaces:**
- Consumes: `InfoTip` (Task 1).
- Produces, in `modelView.ts`:
  - `sideFlags(side: "low" | "high", direction: Direction): { somewhat: Flag; notably: Flag }`. The low side is `somewhat_worse`/`notably_worse` when `higher_is_better`, and `*_better` when `higher_is_worse`.
  - `factorFill(contribution: number, direction: Direction): string | null`. It returns `TIER_FILLS.notably_better` when the factor moves the expected value the favorable way, `TIER_FILLS.notably_worse` when it moves it the less favorable way, and `null` when `contribution === 0`.
  - `shortTierLabel(flag: Flag, direction: Direction): string`, which is `tierLabel` without " than expected" (for example "Notably lower"). "About as expected" and "Not enough data" are unchanged.
- `ResidualRange` gains a `direction: Direction` prop, and `ShapBars` gains `direction: Direction`.

- [ ] **Step 1: Write the failing tests**

```ts
// modelView.test.ts
expect(sideFlags("low", "higher_is_better")).toEqual({ somewhat: "somewhat_worse", notably: "notably_worse" });
expect(sideFlags("low", "higher_is_worse")).toEqual({ somewhat: "somewhat_better", notably: "notably_better" });
expect(factorFill(2.7, "higher_is_better")).toBe("#0571b0");
expect(factorFill(2.7, "higher_is_worse")).toBe("#ca0020");
expect(factorFill(-1, "higher_is_worse")).toBe("#0571b0");
expect(factorFill(0, "higher_is_better")).toBeNull();
expect(shortTierLabel("notably_worse", "higher_is_better")).toBe("Notably lower");
expect(shortTierLabel("none", "higher_is_worse")).toBe("About as expected");
```
```tsx
// ModelCard.test.tsx (replaces the assertions at lines 23–38 and 134)
expect(screen.queryByText("How this county compares")).toBeNull();
expect(screen.queryByText("Figures are rounded.")).toBeNull();
expect(screen.queryByText(/starting point/)).toBeNull();
expect(screen.getByRole("heading", { level: 4, name: "Associated factors" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "About the Life expectancy model" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "About associated factors" })).toBeInTheDocument();
// figures: a <dl class="model-figures"> with three dt/dd pairs, in this order
expect([...container.querySelectorAll(".model-figures dt")].map((d) => d.textContent)).toEqual(["Actual", "Expected", "Difference"]);
// no model result: heading and its ⓘ, no figures
expect(screen.getByRole("button", { name: "About the Life expectancy model" })).toBeInTheDocument();
expect(container.querySelector(".model-figures")).toBeNull();
// ResidualRange.test.tsx: the outer low band takes notably_worse's fill for higher_is_better, notably_better's for higher_is_worse
expect(container.querySelector('[data-band="low-notably"]')!.getAttribute("fill")).toBe("#ca0020");
// ShapBars.test.tsx: the "other" bar has no fill attribute (CSS --chart-muted) whatever its sign
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd web && npx vitest run src/model src/panel/ModelCard.test.tsx src/panel/ResidualRange.test.tsx src/panel/ShapBars.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **The heading** gets `<InfoTip label={`About the ${target.label} model`}>` holding today's range-note text. Keep its `entry.se === null` wording branch. When there's no model result the ⓘ still shows, and it keeps only the first sentence in a general form ("A difference beyond the model's thresholds is flagged as somewhat or notably higher or lower.").
- **Remove** the "How this county compares" `h4`, the rounded note and the base-value intro.
- **Figures:** `<dl class="model-figures">` laid out as three columns: Actual, Expected, and Difference (bold). Keep `model-direction-note` below it.
- **`ResidualRange`:** draw five bands. From low to high:
  - `low-notably` (beyond −t90) and `low-somewhat` (−t90 to −t75), filled from `sideFlags("low", …)` via `tierFill`;
  - `none` (−t75 to +t75), filled with `palette.tierNone`;
  - `high-somewhat` and `high-notably`, filled from `sideFlags("high", …)`.

  Give each band `data-band`. The dot keeps its current fill, plus a `--surface` stroke so it reads on every band. Tick labels must stay readable: they sit below the bands, so check the y positions.
- **Factors:** the heading becomes "Associated factors", with `<InfoTip label="About associated factors">` holding two paragraphs: "They describe what the model expects for a county with this profile; they don't explain the difference above." and today's stand-in paragraph. The paragraph below the bars is removed.
- **`ShapBars`:** `fill={b.other ? undefined : factorFill(b.contribution, direction) ?? undefined}`. In the dark theme, `.dark .shap-bar[fill]` gets `stroke: var(--chart-ink); stroke-width: 1`.
- **E2E:** update `smoke.spec.ts` line 87 to "Associated factors".

- [ ] **Step 4: Run the unit tests, lint and typecheck**

Run: `cd web && npx vitest run && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): model card in three figures, tier-coloured range, associated factors by favorability"
```

### Task 5: Who lives here

**Files:**
- Modify: `web/src/panel/WhoLivesHere.tsx`, `web/src/panel/WhoLivesHere.test.tsx`, `web/src/styles.css` (`.who-*`)

**Interfaces:**
- Consumes: `InfoTip` (Task 1) and the short labels (Task 2; fixtures may still carry the old labels until Task 2 merges, so assert on behaviour, not on fixture label text).

- [ ] **Step 1: Write the failing tests**

```tsx
expect(document.querySelector(".who-note")).toBeNull();
await userEvent.click(screen.getByRole("button", { name: "About race and ethnicity" }));
expect(await screen.findByText(/^Every group except Hispanic or Latino counts only people who are not Hispanic\./)).toBeVisible();
// universe moves to hover text and the accessible name
expect(document.querySelector(".who-universe")).toBeNull();
const label = screen.getByText("Veterans");
expect(label.closest(".who-label")).toHaveAttribute("title", "Civilian population 18 and over");
expect(screen.getByRole("listitem", { name: /Veterans, Civilian population 18 and over/ })).toBeInTheDocument();
```

(If the list items aren't named today, add `aria-label={universe ? `${label}, ${universe}` : undefined}` on the `li`, or assert the visually hidden text instead. Choose one and test that.)

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd web && npx vitest run src/panel/WhoLivesHere.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **The race note** moves into `<InfoTip label="About race and ethnicity">` beside the "Race and ethnicity" `h4`. It reads: "Every group except Hispanic or Latino counts only people who are not Hispanic. " followed by today's `NOTE` text.
- **The universe** moves from the visible span to the label's `title` plus visually hidden text.
- **Layout:** `.who-list` becomes a CSS grid, one column by default and two columns when the panel is at least 22rem wide. Use a container query on `.panel-body` if one exists; otherwise a `@container` on `.who-lives-here`.

- [ ] **Step 4: Run the unit tests, lint and typecheck**

Run: `cd web && npx vitest run && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): Who lives here as a compact fact sheet; definitions behind an ⓘ"
```

### Task 6: Similar counties

**Files:**
- Modify: `web/src/panel/SimilarCounties.tsx`, `web/src/panel/SimilarCounties.test.tsx`, `web/src/styles.css` (`.similar-*`)

**Interfaces:**
- Consumes: `InfoTip` (Task 1) and `shortTierLabel`, `tierFill` (Task 4).

- [ ] **Step 1: Write the failing tests**

```tsx
expect(screen.getByText("Counties with the most similar social and economic profile.")).toBeInTheDocument();
await userEvent.click(screen.getByRole("button", { name: "About similar counties" }));
expect(await screen.findByRole("link", { name: "Methodology" })).toHaveAttribute("href", "/methodology#similar-counties");
// model mode
expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["County", "Actual", "Compared"]);
expect(screen.getAllByRole("row")[2]).toHaveTextContent("Notably higher"); // fixture peer with notably_better, higher_is_better
// values mode unchanged
expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["County", "Value"]);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd web && npx vitest run src/panel/SimilarCounties.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **Basis sentence:** a fixed string. The ⓘ holds today's `basis(features, indicators)` sentence and the Methodology link.
- **Model mode:**
  - drop the Expected column, and the median row's Expected cell;
  - the "Compared" cell is a `.tier-swatch` span (aria-hidden, `background: tierFill(flag, palette)`) plus `shortTierLabel(flag, direction)`;
  - the median row's Compared cell stays empty.

- [ ] **Step 4: Run the unit tests, lint and typecheck**

Run: `cd web && npx vitest run && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): similar counties with a short basis and a three-column compared view"
```

### Task 7: Panel e2e, design guide and as-built notes

**Files:**
- Create: `web/e2e/panel.spec.ts`
- Modify: `docs/design-system.md`, `docs/superpowers/specs/2026-11-15-m13-explorer-content-design.md` (add a closing "As built" section), and `docs/images/explorer.png` (regenerate it with `cd web && npm run screenshot`)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the e2e**

```ts
import { expect, test } from "./fixtures";
for (const vp of [{ width: 320, height: 640 }, { width: 1280, height: 800 }]) {
  for (const url of ["./?i=life_expectancy&c=53033", "./?i=premature_death&show=expected&c=53033"]) {
    test(`the county panel has no horizontal overflow at ${vp.width}px: ${url}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(url);
      const body = page.locator(".panel-body");
      await expect(body.getByRole("heading", { name: "Associated factors" })).toBeVisible();
      const over = await body.evaluate((el) =>
        [...el.querySelectorAll("*")].filter((c) => c.getBoundingClientRect().right > el.getBoundingClientRect().right + 0.5).map((c) => c.className).slice(0, 5),
      );
      expect(over).toEqual([]);
    });
  }
}
```

The existing `a11y.spec.ts` already runs axe on the open panel in both themes. Confirm that it still opens a panel after Task 3. On phones the panel is a drawer: open it the way `mobile.spec.ts` does.

- [ ] **Step 2: Run it**

Run: `cd web && npm run build && CI=1 npx playwright test e2e/panel.spec.ts e2e/a11y.spec.ts`
Expected: PASS. If a box overflows, fix its CSS in the owning component and rerun.

- [ ] **Step 3: Update the design guide**

Update `docs/design-system.md` in these places:
- **Vocabulary:** the rank format `10/139 counties (3rd in WA)`, and its full accessible label.
- **Data colour rules:**
  - the selected county on the strip is `--evergreen` with a rule;
  - factor bars are coloured by favorability using the "notably" fills, with an outline in dark mode;
  - the range bands use the tier fills.
- **Components:** `InfoTip` is the one way to put an explanation behind an ⓘ.

- [ ] **Step 4: Write the as-built note, and regenerate the README screenshot**

Add any deviation from the spec to its "As built" section, with the PR that made it. Then run `cd web && npm run screenshot`, and look at `docs/images/explorer.png`.

- [ ] **Step 5: Run the full web checks**

Run: `cd web && npm test && npm run lint && npm run typecheck && npm run build && CI=1 npx playwright test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/e2e/panel.spec.ts docs
git commit -m "docs: content-review design guide updates, as-built notes and screenshot; panel overflow e2e"
```

```toml workflow-tasks
[[task]]
id = "T1"
title = "Shared InfoTip and the Explorer heading"
steps = 5
depends_on = []
files = ["web/src/components/ui/info-tip.tsx", "web/src/components/ui/info-tip.test.tsx", "web/src/explorer/Explorer.tsx", "web/src/explorer/Explorer.test.tsx", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T2"
title = "Short race and ethnicity labels"
steps = 5
depends_on = []
files = ["pipeline/src/pnw_health/indicators.yaml", "pipeline/tests/test_indicators.py", "docs/superpowers/specs/2026-11-14-m13-branding-design.md", "web/src/test/fixtures/strata.ts"]
labels = ["area:pipeline", "area:web", "type:feature"]

[[task]]
id = "T3"
title = "Panel header and measure section"
steps = 5
depends_on = ["T1"]
files = ["web/src/panel/CountyPanel.tsx", "web/src/panel/CountyPanel.test.tsx", "web/src/panel/rankSummary.ts", "web/src/panel/rankSummary.test.ts", "web/src/panel/StripPlot.tsx", "web/src/panel/StripPlot.test.tsx", "web/src/styles.css", "web/e2e/smoke.spec.ts", "web/e2e/a11y.spec.ts", "web/src/pages/methodology/RaceBreakdownSection.tsx"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T4"
title = "Model card"
steps = 5
depends_on = ["T3"]
files = ["web/src/model/modelView.ts", "web/src/model/modelView.test.ts", "web/src/panel/ModelCard.tsx", "web/src/panel/ModelCard.test.tsx", "web/src/panel/ResidualRange.tsx", "web/src/panel/ResidualRange.test.tsx", "web/src/panel/ShapBars.tsx", "web/src/panel/ShapBars.test.tsx", "web/src/styles.css", "web/e2e/smoke.spec.ts"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T5"
title = "Who lives here"
steps = 5
depends_on = ["T4"]
files = ["web/src/panel/WhoLivesHere.tsx", "web/src/panel/WhoLivesHere.test.tsx", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T6"
title = "Similar counties"
steps = 5
depends_on = ["T5"]
files = ["web/src/panel/SimilarCounties.tsx", "web/src/panel/SimilarCounties.test.tsx", "web/src/styles.css"]
labels = ["area:web", "type:feature"]

[[task]]
id = "T7"
title = "Panel e2e, design guide and as-built notes"
steps = 6
depends_on = ["T2", "T6"]
files = ["web/e2e/panel.spec.ts", "docs/design-system.md", "docs/superpowers/specs/2026-11-15-m13-explorer-content-design.md", "docs/images/explorer.png"]
labels = ["area:web", "area:docs", "type:feature"]
```
