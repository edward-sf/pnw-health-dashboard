# M9 Model Expansion — Design

**Date:** 2026-11-12
**Status:** Approved; implemented in M9
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§4 Export contract, §5 Machine learning, §6 Website). M4 and M5 decisions this builds on are in `2026-11-10-m4-ml-pipeline-design.md` and `2026-11-11-m5-model-ui-design.md`. This document records only what M9 decides; where it is silent, those specs apply.

## 1. Outcome

The model answers its question for more than one outcome, and every county points to the PNW counties most like it.

- **#45 Additional model targets.** Besides life expectancy, the model predicts two more CHR outcomes: premature death and injury deaths. Model mode gets an "Outcome" picker, kept in the URL.
- **#43 Peer counties.** Each PNW county gets its five most similar PNW counties on the model's social and economic features. The county panel shows them in a "Similar counties" section, and clicking one selects it.

**Exit criteria:**
- Every task's "Done when" in §4 is met.
- Pipeline: `uv run pytest`, `ruff check`, `ruff format --check`, `mypy src` pass. Web: `npm test`, `npm run lint`, `npm run typecheck` pass, and the Playwright smoke test passes with `CI=1`.
- `pnw-health run` from the raw cache succeeds and `model.json` validates against the regenerated schema. The `life_expectancy` entry's metrics, flags and SHAP are identical to the pre-M9 `model.json` (same seed, same counties, same features).
- The author has closed the M9 checkpoint issue (§4, T4) before any UI task starts.
- `ci` and `build-deploy` are green on `milestone/m9`.

**Out of scope.** PLACES outcomes as targets (§2.1). Typology clusters, peers drawn from outside the PNW, peers highlighted on the map, and user-chosen peer features or k (§3.4). New problems found along the way get their own issue in Backlog unless they block M9.

## 2. Model targets (#45)

### 2.1 Which targets

`TARGETS = ("life_expectancy", "premature_death", "injury_deaths")`, in that order. The first is the default everywhere.

All three come from CHR, built from death and birth records, and each has a 95% CI per county, which the flag formula needs. PNW coverage in the current export: life expectancy 139 of 149 counties, premature death 142, injury deaths 137, each with a CI wherever it has a value.

PLACES outcomes (diabetes, COPD, depression and others) are not targets. They are CDC small-area model estimates built partly from ACS demographics, so predicting them from ACS features would largely reproduce CDC's own model. The methodology page says so.

### 2.2 Pipeline

- `model/config.py`: `TARGET` becomes `TARGETS` (§2.1). `FEATURES`, `BEHAVIORS`, seeds, folds and LightGBM parameters are shared by every target.
- New check `check_targets(TARGETS, catalog)` beside `check_features`: each target must be a catalog indicator in the `Outcomes` category with a non-null `ci_level` and a direction other than `neutral`. A failure raises `ModelDataError` naming the target and the rule.
- `run_model` loops over `TARGETS`. For each target it calls `build_table(long, target=target)`, then runs the existing CV, flags, SHAP and `compare_behaviors` steps unchanged, and builds one `TargetModel` (§2.4). Each target trains on the counties that have that target and at least one feature, so training counts differ per target and each model card records its own.
- Fold assignment is by state with the fixed seed, as today, so it is the same for every target.
- `validate_model` runs its existing checks once per target, using that target's indicator in place of `TARGET`, and prefixes each problem with the target id. `validate.py` no longer imports `TARGET`.
- `pipeline/scripts/model_report.py` (the checkpoint report) reports each target in turn.

### 2.3 Direction-aware flags

The residual stays `actual − predicted` for every target. `classify` gains a `direction` argument. For `higher_is_better` a positive residual is better than expected, as today. For `higher_is_worse` a negative residual is better. Thresholds, `σ_model²` and the tier boundaries do not change.

### 2.4 Contract

`model.json` changes shape, so `SCHEMA_VERSION` goes from `1.3.0` to `2.0.0`.

```
ModelFile
  targets: {target_id: TargetModel}      # keys in TARGETS order
  peers: Peers                           # §3.2

TargetModel
  label: str                             # from the catalog
  unit: Unit
  direction: "higher_is_better" | "higher_is_worse"
  metrics, behaviors_comparison, global_importance,
  thresholds, counties, model_card       # today's ModelFile fields, unchanged
```

`ModelCard.target` stays and equals the key. JSON Schema in `schema/` and the web's generated types are regenerated in the same PR. `model.json` grows from about 75 KB to about 230 KB with three targets, which is still small enough to load up front (parent spec §4).

### 2.5 Checkpoint

As in M4, a `checkpoint` issue sits between the pipeline work and the UI work. The author reviews each new target's national and PNW metrics, flag distribution and SHAP samples from `model_report.py`. A target that models poorly is removed from `TARGETS` before the UI exposes it, and the decision is recorded in this spec under "Checkpoint outcome". Low birth weight was expected to be the weakest.

**Checkpoint outcome (2026-11-12, #179).** The author dropped `low_birth_weight` from `TARGETS`. LightGBM scored a PNW R² of −1.135 (ridge −1.487) against a national R² of 0.339, and every PNW state's mean residual sat between −0.96 and −1.41 points, so 33 PNW counties were flagged better and 1 worse. That is a regional offset, not county signal. Low birth weight stays available as a values-mode indicator.

### 2.6 URL state and picker

- New param `t=<target_id>`, defaulting to `life_expectancy`. It is parsed like `i`: a value not in `model.targets` falls back to the default and the bad param is cleared. `t` is kept in both modes, so switching modes keeps both the indicator and the target. Existing links are unchanged.
- In model mode, an "Outcome" native `<select>` listing the target labels replaces the dimmed indicator picker and its "Model mode shows life expectancy…" note. A plain select is enough for three options. In values mode the indicator picker is unchanged.

### 2.7 Target-aware model UI

A new `targetView(model, t)` helper in `web/src/model/` returns the target's `label`, `unit`, `direction` and `TargetModel`. Every place that hardcodes "life expectancy" or `"years"` reads from it instead: the Explorer title and subtitle, `ModelCard`, `ResidualRange`, `ModelTable`, `buildShapBars`, the map tooltip in `modelView.ts`, and `IndicatorPicker`. Values are formatted with `formatValue` and `formatSigned` for the target's unit.

- Flag tiers, colours and the legend stay keyed to better and worse, so blue always means better than expected.
- For a `higher_is_worse` target, the model card adds one sentence after the difference: "Higher is worse for this measure, so a positive difference means worse than expected." The `ResidualRange` sentences use the same direction wording.
- The model card heading becomes "{Target label} model". Its section order and the model-mode panel order (parent spec §6, amended in M7) are unchanged.
- The model table's columns take the target's label and unit; sorting is unchanged.

### 2.8 Methodology page

- The metrics table has one row per target: ridge and LightGBM, national and PNW.
- The behaviors comparison becomes one row per target.
- Global importance and the model card details get a target select local to the page (not in the URL), defaulting to life expectancy.
- The model section adds a sentence on why PLACES outcomes are not targets (§2.1) and one on how direction sets the flag sign (§2.3).

## 3. Peer counties (#43)

### 3.1 Method

New module `pipeline/src/pnw_health/model/peers.py`, computed once, independent of the target.

- **Pool:** the 149 PNW counties. `values.json` holds only PNW counties, so every peer can show values and be selected.
- **Features:** the model's `FEATURES`. Race and ethnicity shares are not used, for the same reason the model excludes them (parent spec §5), so peers never mean "counties with a similar racial make-up". Behaviors and outcomes are not used either, so peers are not defined by what the panel compares across them.
- **Scaling:** each feature is standardized to z-scores across the PNW counties and weighted equally.
- **Missing values:** a county with fewer than `PEER_MIN_FEATURES = 6` of the 9 features gets no peers. It is also left out of the candidate pool, so it is never anyone's peer. For the other counties, missing features are filled with the PNW median before scaling.
- **Distance:** Euclidean. Each county keeps its `PEER_K = 5` nearest, nearest first. Ties are broken by FIPS ascending, so the output is deterministic.

### 3.2 Contract

```
Peers
  method: {features: [str], k: int, min_features: int}
  counties: {fips: [fips, ...]}          # all 149 PNW counties; [] when too few features
```

Model validation adds: every county in `peers.counties` is a PNW county, every peer FIPS is a PNW county, no county lists itself, no list has duplicates, and each list has exactly `k` entries or none.

### 3.3 Panel

A "Similar counties" section goes after "Who lives here", in both modes. It is visually and textually separate from the model card, and its wording never links peers to the flag.

- A small table: the selected county first, then its five peers, then the peer median.
- Values mode: one column, the current indicator's value, or "Not available" when it is null. The median uses the peers with a value.
- Model mode: the current target's actual value, expected value and flag tier. The median row shows actual and expected only.
- Each peer name is a button that selects that county, updating `c` exactly as a map click does.
- One line explains the basis: "Most similar PNW counties on income, poverty, education and six other social and economic measures." It links to the methodology section.
- A county with no peers shows: "Not enough data to find similar counties."

### 3.4 Methodology page

A short "Similar counties" section covers the features, the scaling, k, the imputation and minimum-features rule, and why race and ethnicity are left out.

## 4. Tasks

Work order: T1 → T9. Pipeline first, then the checkpoint, then the UI. The roadmap's #45 and #43 are reconciled into these issues when the plan is written: #45 becomes T1, and #43 becomes T3, with new issues for the rest.

| Task | What | Done when |
|---|---|---|
| T1 | Multi-target pipeline and contract (§2.1, §2.2, §2.4) | `model.json` has `targets` keyed by all three targets; `SCHEMA_VERSION` is `2.0.0`; schema and web types are regenerated; `check_targets` and per-target `validate_model` have failing-input tests; the `life_expectancy` entry matches the pre-M9 output. The web reads `targets.life_expectancy`, so the site shows no change. |
| T2 | Direction-aware flags (§2.3) | `classify` takes `direction`; hand-computed tests cover both directions at each tier boundary. |
| T3 | Peer counties in the pipeline (§3.1, §3.2) | `peers` is exported; tests cover hand-computed neighbours on a small synthetic table, tie-breaking, the minimum-features rule, imputation, determinism, and each new validation check. |
| T4 | **Checkpoint**: review per-target metrics, flags and SHAP (§2.5) | The author closes the `checkpoint` issue; any dropped target is removed and recorded in §2.5. |
| T5 | `t` param and Outcome picker (§2.6) | Unit tests for `t` parsing and fallback; the picker replaces the indicator picker in model mode only. |
| T6 | Target-aware model UI (§2.7) | No hardcoded "life expectancy" or `"years"` remains in model UI code; component tests use a fixture with one target of each direction. |
| T7 | Methodology updates (§2.8, §3.4) | Per-target metrics and behaviors rows; the local target select; the PLACES, direction and peers text. |
| T8 | Similar counties panel section (§3.3) | Renders in both modes, including the no-peers case; clicking a peer selects it. |
| T9 | Playwright smoke test | In model mode, switching the outcome updates `t` and the title; selecting a peer updates `c`. |

## 5. Spec changes

Each is made in the same PR as the code it describes.

| Spec | Section | Change | Task |
|---|---|---|---|
| Parent spec | §4 | `model.json` holds one entry per target plus `peers` (§2.4, §3.2). | T1, T3 |
| Parent spec | §5 | "Target is configurable; v1 ships one target" becomes the three targets of §2.1, with direction-aware flag signs (§2.3). | T1, T2 |
| Parent spec | §6 Routes | Add `t=<target_id>` to the Explorer's URL state. | T5 |
| Parent spec | §6 Explorer | Outcome picker in model mode; "Similar counties" panel section after "Who lives here". | T5, T8 |
| Parent spec | §10 | Remove "County peer-group clustering". | T3 |
