# M4 ML Pipeline — Design

**Date:** 2026-11-10
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§4 Contract, §5 Machine learning, §7 Testing). This document records the decisions M4 adds; where it is silent, the parent spec applies.

## 1. Outcome

`pnw-health run` trains the life-expectancy models on all US counties with usable data and exports `model.json`: ridge, LightGBM and behaviors-comparison metrics, tiered flags and SHAP explanations for the 149 PNW counties. M4 stops at the author's checkpoint review. It adds no visible UI.

**Exit criteria:**
- A real pipeline run produces a `model.json` that validates against the contract, and `build-deploy` is green on `milestone/m4`.
- Two runs with the same seed and inputs produce byte-identical `model.json` files.
- For every county with a prediction, `base_value` plus all feature contributions equals `predicted`.
- The milestone PR carries the checkpoint evidence in §8, and the author records a decision to proceed to M5 or revise the design.

**Deferred:**

| Feature | Arrives in | M4 behavior |
|---|---|---|
| Model mode and model card UI | M5 | `mode=model` stays a bad param; the app does not fetch `model.json` |
| Methodology page content | M6 | `model_card` and `behaviors_comparison` are exported but not displayed |

## 2. Findings from the real data

Checked against the current interim data while designing M4. The model figures come from a throwaway linear fit with 5 state-grouped folds. They describe the data and are not LightGBM results.

- **Coverage:** 3,068 counties have a life expectancy, all with a CI. 139 of them are in the PNW.
- **Connecticut does not join.** CHR reports the 8 former counties (`09001`…), while ACS and PLACES report the 9 planning regions (`09110`…). The 8 CHR rows have a target and no features.
- **Kentucky and Pennsylvania have no PLACES behavior measures.** That is 120 and 67 counties. Together with Connecticut they account for all 195 target counties missing behaviors.
- **10 PNW counties have no target:** `02013`, `02060`, `02063`, `02066`, `02164`, `02230`, `02282`, `16025`, `16033`, `41069`.
- **PNW features are complete.** No PNW county with a target is missing a main-model or behavior feature.
- **Linear fit:** national R² 0.63 and RMSE 2.22; PNW R² 0.44 and RMSE 2.49; Idaho alone R² 0.04.
- **PNW residuals are positive on average in every state:** WA +1.25, OR +0.72, ID +1.49, AK +1.07 years. Of the PNW counties beyond the 90% range, 13 are better than expected and 1 is worse.

## 3. Method decisions

**Training population.** Counties with a non-null target and at least one non-null feature. Counties with no features at all are dropped and logged, which today removes Connecticut's 8 rows and leaves 3,060. A county with only some features missing stays in and is imputed within each fold.

**Folds.** Whole states are assigned to 5 folds by a seeded shuffle, so every prediction comes from models that never saw that county's state. The model stage fails with a clear message if the data has fewer than 5 states.

**Explanations come from the fold models.** This replaces the parent spec's final model trained on all counties. Each county is explained by the fold model that produced its out-of-fold prediction, so:
- `base_value` plus all contributions equals `predicted`, and the model card's numbers reconcile.
- No county's explanation has seen its own life expectancy.
- `base_value` can differ between counties in different folds.
- No separate final model is trained.

Global importance is mean |SHAP| across all out-of-fold explanations for the training population.

**What SHAP explains.** Contributions explain why a county's expected value differs from the base value: what the model expects for a county like it. They do not explain the residual, which is by definition the part of life expectancy these features do not account for. Labels in the UI and docs must keep the two apart.

**SHAP calculation.** LightGBM's built-in `predict(pred_contrib=True)`, the same TreeSHAP algorithm as `shap.TreeExplainer`. It returns the base value as well, and it avoids adding `shap` as a dependency.

**LightGBM settings.** Fixed settings stored in `model/config.py`, with no tuning inside the pipeline: tuning against the folds that produce the reported metrics would inflate them. Training uses a fixed seed, `deterministic=True` and one thread. The first settings were chosen before results were seen. The current ones came from the nested tuning described under "Checkpoint outcome", so the averaged nested result, not the single shipped fold assignment, is the fair accuracy figure.

**Checkpoint outcome.** With the first settings (15 leaves, 400 trees), LightGBM tied ridge nationally and trailed it on the PNW. Two throwaway checks on real data, run outside the pipeline over 5 different state-fold assignments, settled the choice:
- Nested state-grouped tuning chose smaller trees almost every time. LightGBM now uses 8 leaves, 200 trees, `min_child_samples` 20 and `reg_lambda` 10. This improved PNW RMSE by about 0.03 with no national loss. Accuracy against ridge is then effectively tied.
- Ridge and LightGBM flag noticeably different PNW counties: the flagged sets overlap about 64% between models, against 83–93% for one model across fold assignments. The main cause is college towns, where students raise the poverty rate and lower income. Ridge reads that as a high-risk profile, giving the 40 US counties with a college-town profile a mean residual of +2.15 years against +0.84 for LightGBM. Benton, OR goes from "notably better" under ridge to no flag.

LightGBM stays the main model because comparing a county with counties like it is the question. Ridge remains the reported baseline. College towns are improved, not solved: Latah, ID (Moscow) is still "notably better". A college-enrollment feature is the direct fix and is not in v1. About 12 PNW counties' flags change with the fold assignment, so model-card wording should not overstate a single flag.

**Counter-intuitive feature direction.** In the shipped model, a higher `severe_housing_cost_burden` raises a county's expected life expectancy: across PNW counties its contribution correlates +0.77 with its value, up to +1.41 years for Kittitas. It most likely stands in for expensive metros and college towns once income is accounted for. SHAP reports the model faithfully, so this is not a bug, but an M5 bar reading "severe housing cost burden: +1.4 years" will look wrong to a lay reader. M5 decides how the model card handles it; the feature list is unchanged.

**Behaviors comparison.** The main and behaviors LightGBM models are both refit on the same counties, using the same state fold assignments. Counties missing any behavior measure are excluded from both, which today removes Kentucky and Pennsylvania. The reported difference is therefore like for like and involves no state-wide imputation.

**Flag variance.** `σ_resid²` and `mean(se_i²)` in the parent §5 formula are computed over the full training population, using the main LightGBM model's out-of-fold residuals. They are not computed on the behaviors-comparison subset or on PNW counties alone.

**Counties without a target.** They appear in `model.json` as `insufficient_data` with null numeric fields and an empty `shap` list. They are in no fold, so they have no out-of-fold prediction.

**Regional offset.** The model keeps its national baseline, because the question in parent §5 is how a county compares with national expectations. The resulting one-sided flag pattern is reviewed explicitly at the checkpoint.

## 4. Pipeline structure

A new `pnw_health/model/` package:

| Module | Responsibility |
|---|---|
| `config.py` | Target, feature IDs, behavior IDs, seed, fold count, LightGBM settings |
| `features.py` | Builds the national table from `long.parquet`, applies the training-population rule, and fails if a behavior or race/ethnicity field reaches the main feature list |
| `cv.py` | Assigns folds; in each fold fits the median imputer on training rows, then fits ridge (standardized features) and LightGBM; returns out-of-fold predictions, contributions and base values |
| `flags.py` | Pure implementation of the parent §5 threshold formula |
| `explain.py` | Selects each county's top 5 contributions by absolute value and computes global importance |
| `compare.py` | Refits the main and behaviors models on shared counties and reports metrics |
| `run.py` | Orchestrates the above and assembles the result |

A new `model` stage runs between `harmonize` and `export` and writes an interim file. `export` reads it, runs the checks in §6 and writes `model.json`. If the interim file is missing, `export` raises the existing `StageInputError`. New dependencies are `lightgbm` and `scikit-learn`, pinned in the uv lockfile.

## 5. `model.json` contract

Defined as Pydantic models in `contract.py`, with `schema/model.schema.json` generated from them. `SCHEMA_VERSION` becomes 1.3.0.

| Field | Contents |
|---|---|
| `metrics` | `ridge` and `lightgbm`, each with `national` and `pnw` blocks of `{rmse, mae, r2, n}` |
| `behaviors_comparison` | `main` and `behaviors`, each with `national` and `pnw` metric blocks; `excluded_states` with the reason. Metrics only: no predictions or SHAP |
| `global_importance` | `[{feature, mean_abs_shap}]`, largest first |
| `thresholds` | `sigma_model`, `z_75`, `z_90` |
| `counties` | Keyed by FIPS, all 149 PNW counties: `actual`, `predicted`, `residual`, `se`, `threshold_75`, `threshold_90`, `flag`, `shap` (top 5 of `{feature, value, contribution}`), `base_value` |
| `model_card` | Target, training county count, feature list, exclusions with reasons, fold count, seed, LightGBM settings and library version |

- `actual`, `predicted`, `residual`, `se`, `threshold_75`, `threshold_90` and `base_value` are nullable for `insufficient_data` counties. `se` is also null for a county with no CI; its thresholds use the parent §5 fallback.
- `shap[].value` is the county's original feature value, null if it was imputed.
- Flags and the additivity check use full-precision numbers. Rounding to 4 decimals happens only at export.
- `model.json` has no timestamp, since `manifest.json` already carries `built_at`.

`web/scripts/gen-types.mjs` adds `model`, so the generated TypeScript types compile against the schema from M4. `loadData` is unchanged until M5.

## 6. Validation before export

Any failure aborts before files are written:
- All 149 PNW counties are present in `counties`.
- `flag` is `insufficient_data` exactly where the target is null.
- For every county with a prediction, `base_value` plus all contributions equals `predicted` within 1e-6, checked before trimming to the top 5.
- Main-model features contain no behavior or race/ethnicity field.
- `actual` and every full-precision SHAP feature value match the current data within 1e-9 (a null SHAP value means the feature is missing), so a stale interim `model.json` is rejected.
- No county outside the 149 appears in `counties`.
- The interim model was trained on the current `long.parquet`: the `model` stage records its SHA-256 next to the interim file, and export stops with `StageInputError` if it differs. This also catches changes to non-PNW counties, which the value checks above cannot see.

## 7. Testing

All offline, using real LightGBM on small synthetic data, with no mocks of project code:
- **Flags:** hand-computed tier boundaries, sign convention, missing-CI fallback, `σ_model²` floor at 0, `insufficient_data`.
- **Features:** a county with no features is dropped; a partially missing county is kept; the excluded-field guard fails on bad config.
- **Folds:** no state is in both train and test; the same seed gives the same folds; fewer than 5 states fails clearly.
- **Imputation:** an extreme value in a held-out fold does not change the fitted medians.
- **Explanations:** additivity holds; the top 5 are the 5 largest by absolute value; imputed values export as null.
- **Comparison:** both models use identical county sets.
- **Contract and CLI:** schema drift guard; each §6 check has a failing-input test; a missing interim file raises `StageInputError`; two runs are byte-identical.

The existing end-to-end fixture holds 6 states (the four PNW states plus one county each in California and New York), enough for 5 folds.

## 8. Tasks and checkpoint

| Issue | Scope |
|---|---|
| M4.T1 (#27) | Package scaffold, dependencies, national feature table, fold-safe imputation |
| M4.T2 (#28) | State-grouped CV, out-of-fold predictions, ridge and LightGBM metrics |
| M4.T3 (#29) | Tiered flag thresholds |
| M4.T4 (#30) | Fold-model SHAP: top 5 and global importance |
| M4.T5 (#31) | Behaviors comparison on shared counties |
| M4.T6 (#32) | Contract, `model` stage, export, validation, model card data |
| M4.T7 (#33) | Checkpoint |

**Checkpoint evidence in the milestone PR:**
- Metrics for all three models, national and PNW, and LightGBM's margin over ridge.
- Flag distribution by state and by county size, showing whether tiny counties dominate.
- The share of PNW flags that are better versus worse than expected, with the regional offset from §2.
- SHAP output for 3–5 counties the author can sanity-check.
- Proof that excluded features are absent from the main model.

## 9. Documentation changes in M4

- Parent spec §4: `model.json` lists `behaviors_comparison` and `model_card`.
- Parent spec §5: training-population rule, behaviors comparison on shared counties, and fold-model SHAP through LightGBM's built-in TreeSHAP.
