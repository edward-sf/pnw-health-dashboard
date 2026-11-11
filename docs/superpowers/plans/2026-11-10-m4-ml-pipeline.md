# M4 ML Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is one GitHub Issue (`M4.T<k>`) and one issue PR into `milestone/m4`. The milestone ends with a single milestone PR `milestone/m4 → main` for the author to review. Follow `CONTRIBUTING.md` for branch, PR, and merge rules. A task's final "Commit" step is followed by its issue PR.

**Goal:** `pnw-health run` trains the life-expectancy models and exports `model.json` with ridge, LightGBM and behaviors-comparison metrics, tiered flags and SHAP explanations for the 149 PNW counties.

**Architecture:** A new `pnw_health/model/` package reads the national long table. Pure functions own features, folds, flags and explanations, and `run.py` assembles them into a full-precision `ModelFile` written to `data/interim/model.json`. `export` validates that file, trims each county to its top 5 contributions, rounds, and writes `web/public/data/model.json`.

**Tech Stack:** Python 3.12, pandas, numpy, LightGBM 4.7, scikit-learn 1.9, Pydantic, Typer, pytest.

**Spec:** `docs/superpowers/specs/2026-11-10-m4-ml-pipeline-design.md`, with parent `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md`. **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`.

## Global Constraints

- FIPS are 5-character strings end to end. State is `fips[:2]`.
- Null is not zero. A missing value stays NaN in pandas and `None` in the contract.
- Docs, docstrings and exported text say "factors associated with," never "drivers" or causal language.
- Main-model features come only from the `Social & Economic` and `Access` catalog categories.
- `z_75 = 1.150`, `z_90 = 1.645`. Tier comparisons are strict (`>`). Positive residual means better than expected.
- Variances use `ddof=0`.
- Flags and additivity use full-precision numbers. Rounding to 4 decimals happens only in `finalize_model`.
- `model.json` has no timestamp.
- Tests never touch the network and use real LightGBM. Do not mock project code.
- Regenerate schemas after any contract change: `cd pipeline && uv run python -c "from pathlib import Path; from pnw_health.contract import write_schemas; write_schemas(Path('../schema'))"`.
- Pipeline checks: `cd pipeline && uv run ruff check && uv run ruff format --check && uv run mypy src && uv run pytest`. Web checks: `cd web && npm run lint && npm run typecheck && npm test`.

## Review Focus

1. **Legacy values becoming training targets.** Chugach and Copper River have a labeled Valdez-Cordova life expectancy, but must be `insufficient_data` and must not train any model. *(Test in T6.)*
2. **Input row order changing results.** The same data in a different row order must give identical predictions. *(Test in T2.)*
3. **A feature entirely missing from a training fold.** It must fail with a clear message, not silently fit on NaN medians. *(Test in T1.)*
4. **NaN reaching the browser.** `insufficient_data` counties must serialize as JSON `null`. *(Test in T6.)*
5. **Alaska FIPS losing leading zeros.** `counties` keys must stay like `"02013"`, and Alaska must be its own state group. *(Tests in T1, T6.)*

---

### Milestone start (no issue)

- [ ] **Step 1:** `milestone/m4` already exists, cut from `origin/main`, with the spec committed. Commit this plan to it: `docs: add M4 implementation plan`.
- [ ] **Step 2:** Push the branch and open the draft PR `milestone/m4 → main` using `.github/PULL_REQUEST_TEMPLATE/milestone.md`.
- [ ] **Step 3:** Update issues #27–#33: replace each "Provisional" body with a link to its task here and its acceptance criteria. Retitle #30 `M4.T4 Fold-model SHAP top-5 contributions and global importance`, and update the M4.T4 line in the roadmap to match. Move them all to `Ready`.

### Task M4.T1: Feature table and fold-safe imputation (#27)

**Files:**
- Create: `pipeline/src/pnw_health/model/__init__.py`, `model/config.py`, `model/features.py`, `pipeline/tests/model/__init__.py`, `tests/model/synthetic.py`, `tests/model/test_features.py`
- Modify: `pipeline/pyproject.toml`, `pipeline/uv.lock`, `pipeline/README.md`

**Interfaces:**
- `config.py`: `TARGET = "life_expectancy"`; `FEATURES: tuple[str, ...] = ("median_household_income", "poverty_rate", "uninsured_rate", "bachelors_or_higher", "unemployment_rate", "age_65_plus", "percent_rural", "severe_housing_cost_burden", "broadband_households")`; `BEHAVIORS = ("current_smoking", "obesity", "physical_inactivity", "binge_drinking")`; `ALLOWED_CATEGORIES = frozenset({"Social & Economic", "Access"})`; `SEED = 42`; `N_FOLDS = 5`; `RIDGE_ALPHA = 1.0`; `Z_75 = 1.150`; `Z_90 = 1.645`; `TOP_N = 5`.
- `config.py`: `LGBM_PARAMS = {"objective": "regression", "n_estimators": 400, "learning_rate": 0.03, "num_leaves": 15, "min_child_samples": 20, "subsample": 0.8, "subsample_freq": 1, "colsample_bytree": 0.8, "reg_lambda": 1.0, "random_state": SEED, "deterministic": True, "force_row_wise": True, "num_threads": 1, "verbosity": -1}`.
- `features.py`: `class ModelDataError(ValueError)`.
- `@dataclass(frozen=True) class ModelTable: frame: pd.DataFrame; dropped: list[str]`. `frame` is indexed by `fips`, sorted, with one column per feature and behavior plus `target`, `ci_low`, `ci_high`, `state`.
- `build_table(long: pd.DataFrame, features: Sequence[str] = FEATURES, behaviors: Sequence[str] = BEHAVIORS, target: str = TARGET) -> ModelTable`.
- `check_features(features: Sequence[str], catalog: list[Indicator]) -> None`.
- `impute_fold(train: pd.DataFrame, test: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]`, returning filled train, filled test and the medians.
- `tests/model/synthetic.py`: `make_long(states: Sequence[str] = ("53", "41", "16", "02", "06", "36", "12"), per_state: int = 30, seed: int = 0) -> pd.DataFrame` in `LONG_COLUMNS`, with every `FEATURES` and `BEHAVIORS` indicator and a target that is linear in the features plus noise, with CIs.

- [ ] **Step 1:** Add dependencies: `cd pipeline && uv add lightgbm scikit-learn`. Add `lightgbm.*` and `sklearn.*` to the mypy `ignore_missing_imports` override. Run `uv run python -c "import lightgbm"`. If it fails on `libomp`, stop and ask the author to run `brew install libomp`. Note that macOS prerequisite in `pipeline/README.md`.
- [ ] **Step 2: Write failing tests** in `test_features.py`:
  - `test_county_with_no_features_is_dropped`: remove every feature row for one county; its FIPS is in `dropped` and absent from `frame`.
  - `test_partially_missing_county_is_kept`: remove one feature row; the county stays, with NaN in that column.
  - `test_null_target_is_excluded`: a county with a NaN target is absent from `frame` and absent from `dropped`.
  - `test_state_and_fips_are_strings`: `"02013"` stays in the index with `state == "02"`.
  - `test_missing_indicator_fails`: a long table without `poverty_rate` raises `ModelDataError` matching `"poverty_rate"`.
  - `test_check_features_rejects_excluded` parametrized over `Behaviors`, `Demographics`, `Outcomes`: raises `ModelDataError` naming the feature. `test_real_features_pass`: `check_features(FEATURES, load_catalog())` does not raise.
  - `test_held_out_extreme_does_not_change_medians`: with train column `[1.0, 2.0, 3.0]` and test `[1e9]`, `medians["x"] == 2.0`.
  - `test_impute_fills_test_from_train`: a NaN in test becomes the train median.
  - `test_all_nan_training_column_fails`: raises `ModelDataError` matching the column name.
- [ ] **Step 3:** Run `cd pipeline && uv run pytest tests/model/test_features.py`. Expected: FAIL (no module).
- [ ] **Step 4:** Implement `config.py` and `features.py`. `build_table` pivots `long` to one row per FIPS and takes `ci_low` and `ci_high` from the target's rows. `impute_fold` uses `train.median()`, not `SimpleImputer`, which silently drops all-NaN columns.
- [ ] **Step 5:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 6:** Commit: `feat(ml): add national feature table and fold-safe imputation`.

### Task M4.T2: State-grouped CV and metrics (#28)

**Files:**
- Create: `pipeline/src/pnw_health/model/cv.py`, `tests/model/test_cv.py`
- Modify: `pipeline/src/pnw_health/contract.py`

**Interfaces:**
- Consumes: `ModelTable.frame`, `impute_fold`, `ModelDataError`.
- `contract.py`: `class Metrics(BaseModel): rmse: float; mae: float; r2: float; n: int` and `class RegionMetrics(BaseModel): national: Metrics; pnw: Metrics`, both with `extra="forbid"`.
- `assign_folds(states: Iterable[str], seed: int = SEED, n_folds: int = N_FOLDS) -> dict[str, int]`.
- `@dataclass(frozen=True) class LgbmOof: predicted: pd.Series`.
- `fit_ridge_oof(frame: pd.DataFrame, features: Sequence[str], folds: dict[str, int]) -> pd.Series`.
- `fit_lightgbm_oof(frame: pd.DataFrame, features: Sequence[str], folds: dict[str, int]) -> LgbmOof`.
- `score(actual: pd.Series, predicted: pd.Series) -> Metrics`.
- `score_regions(frame: pd.DataFrame, predicted: pd.Series) -> RegionMetrics`. PNW rows are those where `state_abbr(fips)` is not None.

- [ ] **Step 1: Write failing tests** in `test_cv.py`, using `build_table(make_long()).frame`:
  - `test_every_state_gets_one_fold`: all states are keys, values are in `range(5)`, and all 5 folds are used.
  - `test_same_seed_same_folds` and `test_input_order_does_not_change_folds`.
  - `test_fewer_states_than_folds_fails`: 4 states raises `ModelDataError` matching `"at least 5 states"`.
  - `test_oof_never_trains_on_own_state`: change every target in one state by +100 and refit; that state's predictions are unchanged, and another state's predictions change.
  - `test_predictions_cover_every_county`, for both ridge and LightGBM: the index equals `frame.index` with no NaN.
  - `test_lightgbm_is_deterministic`: two fits are exactly equal.
  - `test_row_order_does_not_change_predictions`: `build_table(long.sample(frac=1, random_state=1))` gives exactly equal predictions.
  - `test_score_hand_computed`: actual `[1, 2, 3]`, predicted `[1, 2, 5]` gives `rmse == approx(sqrt(4/3))`, `mae == approx(2/3)`, `r2 == approx(-1.0)`, `n == 3`.
  - `test_score_regions_splits_pnw`: `pnw.n` counts only the four PNW states.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement `cv.py`. `assign_folds` sorts distinct states, shuffles with `random.Random(seed)`, and assigns position `i % n_folds`. Ridge is `make_pipeline(StandardScaler(), Ridge(alpha=RIDGE_ALPHA))`, and LightGBM is `LGBMRegressor(**LGBM_PARAMS)`. Both are fit on `impute_fold` output, one fold at a time.
- [ ] **Step 4:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ml): add state-grouped CV with ridge and LightGBM metrics`.

### Task M4.T3: Tiered flag thresholds (#29)

**Files:**
- Create: `pipeline/src/pnw_health/model/flags.py`, `tests/model/test_flags.py`

**Interfaces:**
- `se_from_ci(ci_low: pd.Series, ci_high: pd.Series) -> pd.Series`: `(high − low) / (2 × 1.96)`, NaN when either bound is missing.
- `sigma_model_sq(residuals: pd.Series, se: pd.Series) -> float`.
- `@dataclass(frozen=True) class Flags: se_sq: pd.Series; threshold_75: pd.Series; threshold_90: pd.Series; flag: pd.Series`.
- `classify(residuals: pd.Series, se: pd.Series, sigma_sq: float, mean_se_sq: float) -> Flags`. `mean_se_sq` is the training population's mean, used where `se` is NaN.

- [ ] **Step 1: Write failing tests** in `test_flags.py`:
  - `test_se_from_ci`: bounds 76.04 and 79.96 give `se == approx(1.0)`.
  - `test_sigma_hand_computed`: residuals `[2, -2]`, se `[1, 1]` gives `3.0`.
  - `test_sigma_floor_at_zero`: residuals `[1, -1]`, se `[2, 2]` gives `0.0`.
  - `test_sigma_mean_ignores_missing_ci`: residuals `[3, -3, 3, -3]`, se `[1, NaN, 3, NaN]` gives `9 − 5 == 4.0`.
  - `test_tiers`, with `sigma_sq=9`, `se=0`: residuals `5`, `-5`, `4`, `-4`, `3` give `notably_better`, `notably_worse`, `somewhat_better`, `somewhat_worse`, `none`.
  - `test_exactly_on_threshold_is_lower_tier`: residual `Z_75 * 3.0` gives `none`; residual `Z_90 * 3.0` gives `somewhat_better`.
  - `test_own_uncertainty_widens_threshold`: with `sigma_sq=9`, `se=4` gives `threshold_90 == approx(1.645 * 5)`.
  - `test_missing_ci_uses_mean`: `se=NaN`, `mean_se_sq=16`, `sigma_sq=9` gives `threshold_90 == approx(1.645 * 5)`.
  - `test_null_residual_is_insufficient_data`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement `flags.py`, using `residuals.var(ddof=0)` and `(se**2).mean()`, which skips NaN.
- [ ] **Step 4:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ml): add tiered flag thresholds`.

### Task M4.T4: Fold-model SHAP (#30)

**Files:**
- Create: `pipeline/src/pnw_health/model/explain.py`, `tests/model/test_explain.py`
- Modify: `model/cv.py`, `tests/model/test_cv.py`

**Interfaces:**
- `LgbmOof` gains `contributions: pd.DataFrame` (index FIPS, one column per feature) and `base_value: pd.Series`.
- `@dataclass(frozen=True) class Contribution: feature: str; value: float | None; contribution: float`.
- `ranked_contributions(contributions: pd.Series, values: pd.Series) -> list[Contribution]`: every feature, by absolute contribution descending, ties by feature name. `value` is `None` where `values` is NaN.
- `global_importance(contributions: pd.DataFrame) -> list[tuple[str, float]]`: mean absolute contribution, largest first, ties by feature name.

- [ ] **Step 1: Write failing tests:**
  - `test_additivity` in `test_cv.py`: for every county, `base_value + contributions.sum(axis=1) == approx(predicted, abs=1e-6)`.
  - `test_base_value_comes_from_own_fold`: `base_value` takes more than one distinct value across folds.
  - `test_explanation_ignores_own_state_target`: shift one state's targets by +100 and refit; that state's contributions are unchanged.
  - `test_ranked_by_absolute_value`: contributions `{a: 0.1, b: -3, c: 2}` give order `b, c, a`.
  - `test_ties_break_by_name`.
  - `test_imputed_value_is_none`: a NaN in `values` gives `value is None`, while `contribution` stays numeric.
  - `test_global_importance`: columns `a: [1, -3]`, `b: [0, 1]` give `[("a", 2.0), ("b", 0.5)]`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement. In `fit_lightgbm_oof`, call `model.predict(X, pred_contrib=True)` on each held-out fold. The last column is the base value. `predicted` still comes from `model.predict(X)`, so the additivity test checks something real.
- [ ] **Step 4:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ml): add fold-model SHAP contributions and global importance`.

### Task M4.T5: Behaviors comparison (#31)

**Files:**
- Create: `pipeline/src/pnw_health/model/compare.py`, `tests/model/test_compare.py`
- Modify: `pipeline/src/pnw_health/contract.py`

**Interfaces:**
- Consumes: `fit_lightgbm_oof`, `score_regions`.
- `contract.py`: `class ExcludedState(BaseModel): state_fips: str; counties: int; reason: str` and `class BehaviorsComparison(BaseModel): main: RegionMetrics; behaviors: RegionMetrics; excluded_states: list[ExcludedState]`.
- `compare_behaviors(frame: pd.DataFrame, features: Sequence[str], behaviors: Sequence[str], folds: dict[str, int]) -> BehaviorsComparison`.

- [ ] **Step 1: Write failing tests** in `test_compare.py`:
  - `test_models_use_identical_counties`: blank every behavior in one state; `main.national.n == behaviors.national.n`, and both exclude that state.
  - `test_excluded_state_reported`: `state_fips`, `counties` and a non-empty `reason`.
  - `test_nothing_excluded_when_complete`: `excluded_states == []`.
  - `test_output_has_no_predictions`: `set(BehaviorsComparison.model_fields) == {"main", "behaviors", "excluded_states"}`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The shared set is `frame.dropna(subset=list(behaviors))`, using the `folds` passed in, unchanged.
- [ ] **Step 4:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ml): add behaviors comparison on shared counties`.

### Task M4.T6: `model.json` contract, stage and export (#32)

**Files:**
- Create: `pipeline/src/pnw_health/model/run.py`, `tests/model/test_run.py`, `schema/model.schema.json`
- Modify: `contract.py`, `config.py`, `export.py`, `validate.py`, `cli.py`, `tests/test_contract.py`, `tests/test_export.py`, `tests/test_validate.py`, `tests/test_cli_e2e.py`, `schema/*.json`, `web/scripts/gen-types.mjs`, `web/src/test/fixtures/manifest.ts`

**Interfaces:**
- `SCHEMA_VERSION = "1.3.0"`.
- `contract.py`, all `extra="forbid"`:
  - `ShapEntry`: `feature: str`, `value: float | None`, `contribution: float`.
  - `CountyModel`: `actual`, `predicted`, `residual`, `se`, `threshold_75`, `threshold_90`, `base_value`, each `float | None`; `flag: Flag`; `shap: list[ShapEntry]`.
  - `Flag = Literal["notably_better", "somewhat_better", "none", "somewhat_worse", "notably_worse", "insufficient_data"]`.
  - `Thresholds`: `sigma_model`, `z_75`, `z_90`, each `float`.
  - `ImportanceEntry`: `feature: str`, `mean_abs_shap: float`.
  - `ExcludedCounty`: `fips: str`, `reason: str`. `ExcludedFeatureGroup`: `category: str`, `reason: str`.
  - `ModelCard`: `target: str`, `training_counties: int`, `features: list[str]`, `excluded_counties: list[ExcludedCounty]`, `excluded_feature_groups: list[ExcludedFeatureGroup]`, `n_folds: int`, `seed: int`, `lightgbm_params: dict[str, float | int | str | bool]`, `lightgbm_version: str`.
  - `ModelMetricsBlock`: `ridge: RegionMetrics`, `lightgbm: RegionMetrics`.
  - `ModelFile`: `metrics: ModelMetricsBlock`, `behaviors_comparison: BehaviorsComparison`, `global_importance: list[ImportanceEntry]`, `thresholds: Thresholds`, `counties: dict[str, CountyModel]`, `model_card: ModelCard`.
  - `SCHEMAS` gains `"model.schema.json": ModelFile`.
- `run.py`: `run_model(long: pd.DataFrame, catalog: list[Indicator]) -> ModelFile`. The result is full precision, and each county's `shap` lists every feature. PNW FIPS are the `long.fips` values where `state_abbr` is not None.
- `validate.py`: `validate_model(model: ModelFile, values: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]) -> None`, raising `DataValidationError`.
- `export.py`: `finalize_model(model: ModelFile) -> ModelFile` trims `shap` to `TOP_N` and rounds every float to 4 decimals. `write_exports(out_dir, manifest, values, topology, model: ModelFile)` also writes `model.json`.
- `cli.py`: `Stage.model = "model"`, and `_model(paths)` reads `long.parquet` and writes `paths.interim / "model.json"`.

- [ ] **Step 1: Write failing tests:**
  - `test_run.py`, on `make_long()`: `test_every_pnw_county_present`; `test_null_target_is_insufficient_data` (all numeric fields `None`, `shap == []`); `test_shap_lists_every_feature_and_sums_to_predicted`; `test_residual_sign` (`residual == actual − predicted`); `test_model_card_lists_features`.
  - `test_validate.py`, one failing-input test per check, each asserting on `err.value.problems`: `test_model_missing_county`, `test_model_flag_where_target_present`, `test_model_flag_missing_where_target_null`, `test_model_additivity_broken`, `test_model_excluded_feature_present`.
  - `test_export.py`: `test_finalize_keeps_top_five_by_absolute_value`, `test_finalize_rounds_to_four_decimals`, `test_null_fields_serialize_as_json_null` (the written file parses, with `counties[fips]["predicted"] is None`, and the text does not contain `NaN`). Update existing `write_exports` calls.
  - `test_contract.py`: `write_schemas` returns the three schema names.
  - `test_cli_e2e.py`:
    - `test_full_run_writes_model`: `ModelFile` validates, with 149 counties, and the key `"02013"` is present.
    - `test_legacy_counties_are_insufficient_data`: `02063` and `02066` have `flag == "insufficient_data"` and `actual is None`.
    - `test_two_runs_are_byte_identical`: two full runs into separate roots give equal `model.json` bytes.
    - `test_export_before_model_says_run_model`: after `fetch` and `harmonize`, `export` raises `StageInputError` matching `"--stage model"`.
    - Update `test_stages_are_resumable` to run `Stage.model` before `Stage.export`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `run_model` calls `check_features` first and builds flags from the training population's residuals and `se`. In `_export`, keep the existing order, then require the model file after `validate_display`, so `test_bad_legacy_value_stops_export` still fails on validation. Run `validate_model` before any write. A PNW county with a target that `build_table` dropped fails validation by design.
- [ ] **Step 4:** Regenerate schemas. Add `"model"` to the list in `gen-types.mjs`. Set the web fixture's `schema_version` to `"1.3.0"`.
- [ ] **Step 5:** Run the pipeline and web checks. Expected: all pass.
- [ ] **Step 6:** Run a real `cd pipeline && uv run pnw-health run --root ..`. Expected: exit 0, `web/public/data/model.json` written, 3,060 training counties in `model_card`, 10 `insufficient_data` counties.
- [ ] **Step 7:** Commit: `feat(ml): add model stage and model.json export`.

### Task M4.T7: Checkpoint (#33)

**Files:**
- Create: `pipeline/scripts/model_report.py`

**Interfaces:** `uv run python scripts/model_report.py --root ..` prints markdown to stdout. It reads `web/public/data/model.json`, `data/interim/long.parquet`, and population (`v051_rawvalue`) from the cached CHR file. It writes nothing.

- [ ] **Step 1:** Write the script. It reports:
  - Metrics for all three models, national and PNW, and LightGBM's RMSE margin over ridge.
  - Flag counts by state, and by population tercile of PNW counties.
  - Better versus worse counts among PNW flags, and mean residual by state.
  - Top-5 SHAP for King (`53033`), Multnomah (`41051`), Ada (`16001`), Anchorage (`02020`) and Kusilvak (`02158`).
  - Global importance, and each model feature's catalog category.
- [ ] **Step 2:** Run it on the real export from T6. Expected: every section prints, and no feature is in `Behaviors`, `Demographics` or `Outcomes`.
- [ ] **Step 3:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 4:** Commit: `chore(ml): add checkpoint report script`. Paste the output into the milestone PR under Verification. Leave #33 open: only the author closes it.

### Milestone review (no issue)

- [ ] **Step 1:** Run all checks on `milestone/m4`, and a real `cd pipeline && uv run pnw-health run --root ..` twice. Expected: the two `model.json` files are byte-identical.
- [ ] **Step 2:** Confirm `ci` and `build-deploy` are green on `milestone/m4`, including LightGBM loading on the Linux runner.
- [ ] **Step 3:** Fill in the milestone PR: every issue PR, `Closes` lines for #27–#33, verification evidence, the checkpoint report and any deviations. Mark it ready for the author.
