# M5 Model UI — Design

**Date:** 2026-11-11
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§5 Machine learning, §6 Website, §7 Testing). The `model.json` contract is in `2026-11-10-m4-ml-pipeline-design.md` §5. This document records the decisions M5 adds; where it is silent, the parent spec applies.

## 1. Outcome

The Explorer gains a model mode. The map colours each county by how its life expectancy compares with what the model expects, the table lists the same comparison, and every county panel carries a model card. No pipeline or contract changes.

**Exit criteria:**
- `?mode=model` loads model mode directly, and the Values/Model toggle switches modes without losing `i`, `c` or `view`.
- The map, legend, tooltip, table and model card all show the same tier for a county, from one shared definition.
- For every county with a prediction, the card's numbers reconcile: base value plus the shown factors plus "All other factors" equals the expected value.
- No copy describes the factors as causes or as explaining the difference between actual and expected.
- `ci` and `build-deploy` are green on `milestone/m5`, including the extended Playwright smoke test.

**Deferred:**

| Feature | Arrives in | M5 behavior |
|---|---|---|
| Model card, metrics and behaviors comparison on the methodology page | M6 | `model_card`, `metrics`, `behaviors_comparison` and `global_importance` are loaded but not displayed |
| Mobile bottom sheet and touch tooltips | M6 | Model mode uses the existing layout and tooltip |

## 2. Findings from the real data

From the current export (`web/public/data/model.json`, 76 KB):
- **Tiers:** 109 none, 14 notably better, 11 somewhat better, 4 somewhat worse, 1 notably worse, 10 insufficient data. Better than expected outnumbers worse 25 to 5, which reflects the positive regional offset found in M4 (§2 of the M4 spec). The legend shows counts so this lean is visible rather than surprising.
- **Every SHAP feature is a manifest indicator** (9 features, all ACS percentages, dollars or `percent_rural`), so labels and units come from the manifest with no new mapping.
- **The exported `shap` list is the top 5.** The other contributions are not exported; their sum is `predicted − base_value − Σ top 5`.
- **No PNW county with a prediction has a null `se` today**, but the contract allows it, so the card handles it.
- **Residuals range from −5.0 to +11.8 years.**

## 3. URL state and data flow

- **Loading.** `loadData` fetches `model.json` in the same `Promise.all` as the other three files, and `AppData` gains `model: ModelFile`. The card shows in both modes, so nearly every panel needs the file. A load failure uses the existing full-page error with retry. The schema major-version check stays on the manifest.
- **`mode` param.** `parseParams` accepts `values` and `model`; any other value is invalid and cleared as today. `ExplorerParams.mode` becomes `"values" | "model"`.
- **`setMode`.** `useExplorerParams` gains `setMode`. Like `setView`, a mode change pushes a history entry and keeps `i`, `c` and `view`.
- **Toggle.** A Values/Model button pair sits beside Map/Table, using the same `aria-pressed` pattern.
- **Picker in model mode.** The picker stays usable but dimmed, with the note: "Model mode shows life expectancy compared with what the model expects. Your indicator choice is kept for values mode." Picking an indicator updates `i` and stays in model mode.
- **Title in model mode.** "Life expectancy: compared with expected", a one-line description, and the life-expectancy source line.
- **Explorer nav link (#85).** The nav link back to the Explorer carries the current Explorer query (`i`, `c`, `mode`, `view`), so visiting Methodology or About and returning through the nav restores the state.
- **`model/modelView.ts`.** One pure module holds the tier order, tier labels, tier colours and sort rank, plus the lookup that treats a county missing from `model.counties` as `insufficient_data`. The map, legend, table and card all use it.

## 4. Map, legend, tooltip and table

**Tier colours** (diverging, colour-blind safe, red is worse as in values mode):

| Tier | Label | Colour |
|---|---|---|
| `notably_worse` | Notably worse than expected | `#ca0020` |
| `somewhat_worse` | Somewhat worse than expected | `#f4a582` |
| `none` | About as expected | `#e3e3e3` |
| `somewhat_better` | Somewhat better than expected | `#92c5de` |
| `notably_better` | Notably better than expected | `#0571b0` |
| `insufficient_data` | Not enough data | existing hatch |

`none` is a neutral grey rather than RdBu's near-white, so the 109 unflagged counties don't read as missing next to the hatch (base `#f2f2f2`).

**Legend.** Worse to better, left to right, each swatch with its county count, e.g. "Notably better (14)", plus "Not enough data (10)" with the hatch. Below it: "Compared with what the model expects for counties nationwide with a similar social and economic profile."

**Tooltip.** "Latah, ID: notably better than expected (+3.7 years)". With no prediction: "{County}, {ST}: not enough data for the model".

**Map.** `CountyMap` is unchanged; Explorer passes model `fillFor` and `tooltipFor`.

**Table in model mode.** Columns: county, state, life expectancy (actual), expected, difference (signed, years), result (tier label). Sorting reuses `sortRows`. Result sorts by tier rank, worse to better. `insufficient_data` and nulls sort last in both directions. County buttons, `aria-sort` and focus handling are unchanged. Rank columns don't appear in model mode.

## 5. Model card

The card sits in the county panel in both modes, between the strip plot and "Who lives here", under the heading **"Life expectancy model"**. It has two parts, separated by a divider.

### Part 1: "How this county compares"
- Actual {80.8} years · Expected {77.1} years · Difference **{+3.7} years**.
- A tier badge in the tier colour with the tier label.
- **Range graphic:** a number line centred on 0 with a light band for ±`threshold_75`, a darker band for ±`threshold_90`, and a dot at the residual. Its screen-reader text states the difference and both ranges.
- **Range sentence:** "A difference beyond ±{2.4} years is flagged as somewhat better or worse, and beyond ±{3.4} years as notably. These ranges allow for the model's typical error and this county's own measurement uncertainty." If `se` is null, the second sentence ends "…and a typical county's measurement uncertainty, since this county's estimate has no confidence interval," matching the parent §5 fallback.

### Part 2: "Factors associated with the expected value"
Its own subheading. It uses one neutral hue and never the tier colours, so it never reads as explaining the gap.
- **Lead line:** "These factors moved the model's expected value from a starting point of {75.0} to {77.1} years. They describe what the model expects for a county with this profile; they don't explain the difference above."
- **Bars:** five horizontal bars on a zero axis, direction shown by side. Each has a label like "Bachelor's degree or higher: 43.0%" and a value like "+2.58 years". Labels and units come from the manifest. A null `value` reads "value not reported; estimated".
- **"All other factors" row:** `predicted − base_value − Σ top 5`, drawn the same way, so the card reconciles.
- **Implementation:** a pure `buildShapBars(county, indicators)` returns the rows and is unit-tested; Observable Plot renders them, following the `StripPlot` pattern. A text list gives screen readers the same content.

### No model result
For `insufficient_data`: "The model has no result for this county because its life expectancy isn't reported." with a Methodology link. No numbers, range graphic or bars.

### Wording rules
Card, legend, tooltip and table copy say "factors associated with", never "drivers", "causes" or "because of" in relation to the factors, and never link the factors to the difference. A test renders the card for every tier and fails on "driver", "cause" or "because of" anywhere in the card. The no-result sentence's "because its life expectancy isn't reported" is about missing data and stays allowed.

## 6. Error handling

- `model.json` fails to load → full-page error with retry (existing path).
- A county missing from `model.counties` → treated as `insufficient_data`. M4's export validation guarantees all 149, so this is defensive only.
- `mode` with an unknown value → cleared, values mode.

## 7. Testing

**Web (Vitest), against committed fixtures.** A small `model` fixture adds one county per tier, one `insufficient_data` county, one with null `se`, and one with an imputed SHAP value.
- `parseParams`: `mode=model` accepted, junk cleared. `setMode` keeps `i`, `c`, `view` and pushes history.
- Nav link restores `i`, `c`, `mode` and `view` (#85).
- `modelView`: tier order, labels, sort rank, missing-county fallback, tier colours distinct from the hatch base.
- Legend counts; model tooltip text for a predicted and a no-result county.
- Table: model columns, tier sort with nulls last in both directions, no rank columns.
- `buildShapBars`: top 5 plus "All other factors" summing to `predicted − base_value`; imputed label; units from the manifest.
- Card: every tier, `insufficient_data`, null `se`, and the wording guard.
- `loadData` fetches `model.json` and fails cleanly when it is missing.

**Playwright,** against the real build, asserting structure, never specific counts: switch to Model → URL has `mode=model` → legend shows five tiers and the hatch → click a county → card heading and factors subheading visible → Table → Result column present → Back restores values mode. A failed run uploads the Playwright report and trace as a workflow artifact (#86).

## 8. Tasks

Issue IDs stay as they are where they exist. #85, #101 and #86 fold into tasks.

| Task | Scope |
|---|---|
| M5.T1 (#34) | Load `model.json`, `mode` param, `setMode`, toggle, `modelView`, map fill, legend, tooltip, picker dimming, model-mode title, nav link keeps Explorer state (#85) |
| M5.T2 (#35) | Model card: comparison, range graphic, factors bars and "All other factors", no-result state, wording guard; #101 panel items (`County` in a shared types module, shared `formatBound`/`formatValue` plus a signed format, clear `focusRequested` if no panel renders, assert `.panel-ranks` absent) |
| M5.T3 (new) | Model-mode table columns and sorting; #101 table and search items (memoize `rows`, "not available" and CI-absent assertions, search listener cleanup and ref, `aria-controls` only when the listbox renders) |
| M5.T4 (#36, renamed) | Playwright smoke test extended to model mode; failure artifacts in `build-deploy` (#86) |

## 9. Documentation changes in M5

- Parent spec §6: the Values/Model toggle, the picker in model mode, the model-mode table, and the card's "All other factors" row.
- Roadmap: M5 lists four tasks, with T3 the model table and T4 the Playwright test.
- `docs/milestone-review-template.md`: M5 adds "the card's numbers reconcile for 2–3 counties I check" and "the factors section never reads as explaining the difference".
