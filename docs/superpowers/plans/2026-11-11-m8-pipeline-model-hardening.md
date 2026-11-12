# M8 Pipeline + Model Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the eleven M1–M4 pipeline and model follow-ups, so that a half-written export, a missing key, a dropped state or a degenerate model input stops the run with a clear message, and the model package's tests cover the leaks the M4 reviewers flagged.

**Architecture:** Local edits to existing pipeline modules: `export.py`, `cli.py`, `config.py`, `validate.py`, `sources/places.py`, `sources/chr.py`, `harmonize.py` and `model/*`. There is one new module, `pnw_health/numeric.py`, and one new CLI command, `pnw-health schema`. No exported data, contract or `schema/` changes.

**Tech Stack:** Python 3.12, uv, pandas, pydantic, typer, scikit-learn, LightGBM, geopandas/topojson, pytest, ruff, mypy.

**Spec:** `docs/superpowers/specs/2026-11-11-m8-pipeline-model-hardening-design.md`, with parent `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md` and `docs/superpowers/specs/2026-11-10-m4-ml-pipeline-design.md`. **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`. **Workflow:** `CONTRIBUTING.md`.

## Global Constraints

- No `web/`, `schema/` or contract (`contract.py` models) changes. `SCHEMA_VERSION` stays `"1.3.0"`. No new runtime or dev dependencies.
- FIPS are 5-character strings. Null is not zero.
- Exported data must not change. A from-cache `pnw-health run` gives four export files identical to `main`'s, apart from `manifest.json`'s `built_at`.
- Exact copy:
  - `CENSUS_API_KEY not set (environment or <root>/.env)`
  - `<indicator_id>: no values for <ST>`
  - `no standard errors: cannot compute sigma`
  - `schema/ is out of date; run \`uv run pnw-health schema --root ..\` from pipeline/`
- Model copy says "associated with", never "cause(s)", "driver(s)" or "explain(s) the difference".
- Pipeline checks, all from `pipeline/`: `uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src`. Every task ends with these green.
- Each task is one issue branch `<issue>-<slug>` cut from up-to-date `milestone/m8`. Its PR targets `milestone/m8` and is titled in Conventional Commit form. The body says `Part of #<n>` and notes any deviation from the plan. It is squash-merged once `ci` passes and it has been self-reviewed (CONTRIBUTING "Lifecycle of an issue").

## Review Focus

1. **A killed export run.** If the process dies mid-write, no stray directory or partial file may end up in `web/public/data`, because Vite copies that folder into the site. *(Test in T1: no `.data-export-*` directory inside `out_dir`, ever.)*
2. **An empty `CENSUS_API_KEY=` in the environment.** A variable that is set but empty counts as missing: the run fails fast with the same message, rather than sending a request with an empty key. *(Test in T2.)*
3. **Later stages without a key.** `--stage harmonize`, `--stage model` and `--stage export` must never ask for the key. *(Test in T2.)*
4. **A state whose rows exist but are all null.** #65 must catch this case as well as the case where the state has no rows at all. Only an all-null source looks like this. *(Test in T5.)*
5. **A FIPS that lost its leading zero.** A 4-digit `locationid` must raise, not be filtered out quietly with the national rows. *(Test in T4; spec §3.4.)*

---

### Milestone start (no issue)

- [x] **Step 1:** `milestone/m8` exists locally with the spec commit. Confirm it's based on current `origin/main`: `git merge-base --is-ancestor origin/main milestone/m8`.
- [x] **Step 2:** In the roadmap's M8 section:
  - Prefix each line with its task ID: T1 #61, T2 #66, T3 #60, T4 #113, T5 #65, T6 #100, T7 #64, T8 #63, T9 #119, T10 #120, T11 #121.
  - Add `**Plan:** \`2026-11-11-m8-pipeline-model-hardening.md\` (spec \`2026-11-11-m8-pipeline-model-hardening-design.md\`)`.
  - Add `Work order: T1–T11 in order (spec §3).`
- [x] **Step 3:** Commit the plan and roadmap to `milestone/m8`: `docs: add the M8 plan and number its tasks in the roadmap`.
- [ ] **Step 4:** Push with `-u origin milestone/m8`, then open the draft PR `milestone/m8 → main` using `.github/PULL_REQUEST_TEMPLATE/milestone.md`.
- [ ] **Step 5:** Reconcile the issues:
  - Retitle each one `M8.T<k> <current title>`, except #65, which becomes `M8.T5 Fail validation when a state has no values for an indicator`.
  - Append to each body a link to its task here, plus the task's acceptance criteria. For #65, add "fails validation; exemptions in `PARTIAL_STATES`". For #113, add "4-digit FIPS raise".
  - Move T1–T11 to `Ready`.

### Task M8.T1: Atomic export set (#61)

**Files:**
- Modify: `pipeline/src/pnw_health/export.py` (`write_exports`), parent spec §3 Export (M8 spec §2 row)
- Test: `pipeline/tests/test_export.py`

**Interfaces:**
- Produces: `write_exports(out_dir, manifest, values, topology, model) -> list[Path]`. The signature and the returned final paths (in the order manifest, values, topojson, model) are unchanged.

- [ ] **Step 1: Write failing tests** in `test_export.py`:
  - `test_write_exports_failure_keeps_previous_export`:
    - Run `write_exports` once into `tmp_path / "data"` and record each file's bytes.
    - Monkeypatch `pnw_health.export._write_json` with a wrapper that raises `OSError("disk full")` on its 2nd call and delegates otherwise.
    - Call `write_exports` again with a changed manifest and expect `OSError`.
    - The four files' bytes are unchanged. `list(tmp_path.glob(".data-export-*")) == []`.
  - `test_write_exports_leaves_only_the_four_files`:
    - After a successful write, `sorted(p.name for p in out.iterdir()) == ["counties.topojson", "manifest.json", "model.json", "values.json"]`.
    - No `.data-export-*` directory exists next to `out` (Review Focus 1).
- [ ] **Step 2:** Run `uv run pytest tests/test_export.py -k write_exports -v`. The failure test should FAIL, because the old values file has already been overwritten.
- [ ] **Step 3: Implement.**
  - Create `tmp = Path(tempfile.mkdtemp(dir=out_dir.parent, prefix=f".{out_dir.name}-export-"))` after `out_dir.mkdir(parents=True, exist_ok=True)`.
  - Write the four files into `tmp` through `_write_json`/`write_model`.
  - Then `os.replace(tmp / name, out_dir / name)` for each, in the order manifest, values, topojson, model.
  - Use `shutil.rmtree(tmp, ignore_errors=True)` in a `finally`.
  - The docstring states the four-rename limit from spec §3.1.
- [ ] **Step 4:** Run the pipeline checks. `test_cli_e2e.py` still passes.
- [ ] **Step 5:** Apply the parent-spec §3 Export amendment (M8 spec §2).
- [ ] **Step 6:** Commit and open the PR `fix(pipeline): write the export files as a set`, `Part of #61`.

### Task M8.T2: Fail fast without `CENSUS_API_KEY` (#66)

**Files:**
- Modify: `pipeline/src/pnw_health/cli.py` (`_fetch`, `run_pipeline`, `run`)
- Test: `pipeline/tests/test_cli_e2e.py`

**Interfaces:**
- Consumes: `acs_cache_path(raw_dir, catalog) -> Path`.
- Produces: `run_pipeline(paths, stage, *, client, api_key=None, refresh=False, root: Path | None = None) -> None`. `root` is used only in the message. When it is `None`, the message reads `(environment or .env)`. `run` passes `root`. Missing key: `StageInputError(f"CENSUS_API_KEY not set (environment or {root / '.env'})")`.

- [ ] **Step 1: Write failing tests** in `test_cli_e2e.py`. Each uses a handler that appends to a `seen` list and returns 500.
  - `test_fetch_without_key_or_cache_fails_fast`: call `run_pipeline(paths, Stage.fetch, client=..., api_key=None, root=tmp_path)`. It raises `StageInputError`, `str(err) == f"CENSUS_API_KEY not set (environment or {tmp_path / '.env'})"`, and `seen == []`.
  - `test_fetch_without_key_uses_acs_cache`:
    - Copy `ACS_SAMPLE` to `acs_cache_path(paths.raw, load_catalog())`, and serve the other sources with `transport(full_zip)`.
    - `run_pipeline(..., Stage.fetch, api_key=None)` succeeds, and no request goes to `api.census.gov`.
  - `test_refresh_without_key_fails_fast`: with the ACS cache in place, `refresh=True` and `api_key=None` raise the same error.
  - `test_later_stages_need_no_key` (Review Focus 3): run `Stage.all` with a key, then run `Stage.harmonize`, `Stage.model` and `Stage.export` with `api_key=None` and the `failing` handler. All succeed.
  - `test_cli_empty_env_key_fails_fast` (Review Focus 2):
    - `monkeypatch.setenv("CENSUS_API_KEY", "")` with no `.env` in the root.
    - `CliRunner().invoke(cli.app, ["run", "--stage", "fetch", "--root", str(root)])` gives `exit_code == 1` and `"CENSUS_API_KEY not set" in result.output`.
    - Patch `cli.make_client` to the recording client and assert no request was made.
- [ ] **Step 2:** Run `uv run pytest tests/test_cli_e2e.py -k key -v`. FAIL: today a request goes out and the run raises `FetchError`.
- [ ] **Step 3: Implement.**
  - At the top of `_fetch`, before any fetch: if `api_key` is falsy and (`refresh` or not `acs_cache_path(paths.raw, catalog).exists()`), raise the `StageInputError` above.
  - Thread `root` from `run_pipeline` to `_fetch`.
  - `run` passes `root=root`.
- [ ] **Step 4:** Run the pipeline checks.
- [ ] **Step 5:** Commit and open the PR `fix(pipeline): fail fast when CENSUS_API_KEY is missing`, `Part of #66`.

### Task M8.T3: `.env` parser (#60)

**Files:**
- Modify: `pipeline/src/pnw_health/config.py` (`census_api_key`)
- Test: `pipeline/tests/test_config.py`

**Interfaces:**
- Produces: `census_api_key(root: Path) -> str | None`, same signature.

- [ ] **Step 1: Write a failing parametrized test** `test_census_api_key_dotenv_forms`. With `CENSUS_API_KEY` unset in the environment, writing each line to `.env` gives:

  | `.env` line | Expected |
  |---|---|
  | `export CENSUS_API_KEY=abc` | `"abc"` |
  | `export   CENSUS_API_KEY=abc` | `"abc"` |
  | `CENSUS_API_KEY=abc # note` | `"abc"` |
  | `CENSUS_API_KEY="abc # not a comment"` | `"abc # not a comment"` |
  | `CENSUS_API_KEY='abc' # note` | `"abc"` |
  | `CENSUS_API_KEY=ab#c` | `"ab#c"` |
  | `# CENSUS_API_KEY=abc` | `None` |
  | `CENSUS_API_KEY= # note` | `None` |

- [ ] **Step 2:** Run `uv run pytest tests/test_config.py -v`. The `export` and comment rows FAIL.
- [ ] **Step 3: Implement** in `census_api_key`, applying spec §3.3 to each line:
  - Skip a blank line, or one whose stripped form starts with `#`.
  - Strip a leading `export` plus whitespace (`re.match(r"export\s+", line)`).
  - Partition on the first `=`.
  - A value starting with `"` or `'` ends at the matching closing quote, and anything after it is ignored.
  - Otherwise, cut at the first `re.search(r"\s#", value)` and strip.
  - An empty result returns `None`, as now.
- [ ] **Step 4:** Run the pipeline checks.
- [ ] **Step 5:** Commit and open the PR `fix(pipeline): accept export prefixes and inline comments in .env`, `Part of #60`.

### Task M8.T4: Aggregate FIPS rows in PLACES (#113)

**Files:**
- Modify: `pipeline/src/pnw_health/sources/places.py` (`parse_places`)
- Test: `pipeline/tests/sources/test_places.py`

**Interfaces:**
- Produces: `parse_places(path, catalog) -> pd.DataFrame`, same signature. It raises `FetchError` (via `_invalid`) on a `locationid` that is neither 2 nor 5 digits.

- [ ] **Step 1: Write failing tests**, each from a small Socrata JSON written to `tmp_path` in the shape the existing tests use:
  - `test_national_rows_dropped`: one catalog measure with rows for `53033` and `59`. The output FIPS are `["53033"]` and `out.fips.str.len().eq(5).all()`.
  - `test_short_county_fips_raises` (Review Focus 5): a row with `locationid` `"2013"` raises `FetchError` matching `2013`.
- [ ] **Step 2:** Run `uv run pytest tests/sources/test_places.py -v`. Both FAIL.
- [ ] **Step 3: Implement.**
  - After loading `table`, drop rows where `locationid.str.fullmatch(r"\d{2}")`.
  - If any remaining `locationid` does not `fullmatch(r"\d{5}")`, raise `_invalid(f"unexpected locationid(s) {examples}")` with up to five sorted examples.
- [ ] **Step 4:** Run the pipeline checks. `test_cli_e2e.py` still passes; the fixture has no such rows.
- [ ] **Step 5:** Commit and open the PR `fix(pipeline): drop national rows from PLACES`, `Part of #113`.

### Task M8.T5: Fail validation on an empty state (#65)

**Files:**
- Modify: `pipeline/src/pnw_health/validate.py`, parent spec §3 Validation (M8 spec §2 row)
- Test: `pipeline/tests/test_validate.py`

**Interfaces:**
- Consumes: `STATES` and `state_abbr` from `config.py`.
- Produces: `PARTIAL_STATES: dict[str, frozenset[str]] = {}` in `validate.py`, keyed by indicator id with state abbreviations as values. `validate_display` gains the two problems below and keeps its signature.

- [ ] **Step 1: Write failing tests** in `test_validate.py`, using `valid_values(pnw_fips())`:
  - `test_state_with_no_rows_fails`: drop every `pct` row whose FIPS starts with `02`. `"pct: no values for AK" in problems(...)`.
  - `test_state_with_all_null_values_fails` (Review Focus 4): set `value = None` for every `02` row of `pct`. The same problem appears.
  - `test_partial_state_exempt`: `monkeypatch.setitem(validate.PARTIAL_STATES, "pct", frozenset({"AK"}))`. The no-rows frame passes.
  - `test_unknown_partial_state_id_fails`: `monkeypatch.setitem(validate.PARTIAL_STATES, "nope", frozenset({"AK"}))` on valid data. A problem mentions `nope` and says it is not in the catalog.
  - `test_partial_states_empty`: `validate.PARTIAL_STATES == {}`.
- [ ] **Step 2:** Run `uv run pytest tests/test_validate.py -v`. FAIL.
- [ ] **Step 3: Implement.**
  - In the per-indicator loop, after the existing "no non-null values" check (which stays, and `continue`s): compute the states that have present rows with `present.fips.map(state_abbr)`.
  - For each abbreviation in `STATES.values()` not in that set and not in `PARTIAL_STATES.get(ind.id, frozenset())`, append `f"{ind.id}: no values for {abbr}"`.
  - Before the loop, add a problem for each `PARTIAL_STATES` key that is not a catalog id: `f"PARTIAL_STATES lists {id} which is not in the catalog"`.
- [ ] **Step 4:** Run the pipeline checks. `test_cli_e2e.py` still passes, because the fixtures have values in every state for all 37 indicators (checked while planning). Also run `uv run pnw-health run --stage export --root ..` against the real interim data and expect success.
- [ ] **Step 5:** Apply the parent-spec §3 Validation amendment (M8 spec §2).
- [ ] **Step 6:** Commit and open the PR `feat(pipeline): fail validation when a state has no values for an indicator`, `Part of #65`.

### Task M8.T6: Source parsing edge cases (#100)

**Files:**
- Modify: `pipeline/src/pnw_health/config.py`, `harmonize.py`, `sources/chr.py`, `sources/places.py`, `pipeline/scripts/record_fixtures.py`
- Test: `pipeline/tests/sources/test_chr.py`, `tests/sources/test_places.py`, `tests/test_harmonize.py`, `tests/test_record_fixtures.py`

**Interfaces:**
- Produces:
  - `VALDEZ_CORDOVA_FIPS = "02261"` in `config.py`.
  - `chr._fields(catalog: list[Indicator]) -> list[Indicator]`, with the `year` parameter removed.
  - `LEGACY_DTYPES: dict[str, str]` in `harmonize.py`: `fips`/`indicator_id`/`legacy_fips`/`legacy_name` are `"string"`, `year` is `"Int64"`, `value`/`ci_low`/`ci_high` are `"float64"`.

- [ ] **Step 1: Write failing tests:**
  - `test_chr.py::test_fetch_fails_when_ci_column_missing`: write the CHR fixture with `life_expectancy`'s `_cilow` column removed and serve it through a mock transport. `fetch_chr(..., CHR_YEAR)` raises `FetchError` naming that column.
  - `test_places.py::test_catalog_measure_with_no_rows_raises`: a Socrata file holding every catalog PLACES measure but one. `parse_places` raises `ValueError` naming that indicator's id.
  - `test_harmonize.py::test_empty_legacy_has_populated_dtypes`: `harmonize` on frames with no `02261` rows gives `legacy.dtypes.to_dict()` equal to `LEGACY_DTYPES` (as `dtype` objects). A run with legacy rows gives the same dtypes.
  - `test_record_fixtures.py::test_chr_recorder_skips_blank_rows`: drive `_record_chr_file` through a mock client serving a CSV with a blank line between data rows. It writes the data rows and no blank one. Point `FIXTURES` at `tmp_path` via `monkeypatch.setattr(module, "FIXTURES", tmp_path)`.
- [ ] **Step 2:** Run those four tests. All FAIL: the blank-row test with `IndexError`, the others on their assertions.
- [ ] **Step 3: Implement**, one bullet per spec §3.6 item:
  - `fetch_chr`'s `needed` adds `*_ci_columns(i.source_field)` for each `_fields(catalog)` indicator with `i.ci_level is not None`, only when `year == CHR_YEAR`.
  - `parse_places` collects the catalog PLACES measures whose `rows` frame is empty and raises `ValueError(f"PLACES has no rows for: {', '.join(ids)}")`.
  - Replace the `"02261"` literals in `harmonize.py`, `sources/chr.py` and `scripts/record_fixtures.py` with `VALDEZ_CORDOVA_FIPS`.
  - Build the legacy frame with `.astype(LEGACY_DTYPES)`.
  - `_record_chr_file` skips rows where `len(row) <= fips_at`.
  - Remove `_fields`'s `year` parameter.
- [ ] **Step 4:** Run the pipeline checks. `test_cli_e2e.py` still passes, since the fixture has every CI column (checked while planning).
- [ ] **Step 5:** Commit and open the PR `chore(pipeline): tighten source parsing edge cases`, `Part of #100`.

### Task M8.T7: `pnw-health schema` command (#64)

**Files:**
- Modify: `pipeline/src/pnw_health/cli.py`, `pipeline/tests/test_contract.py` (drift message), `CONTRIBUTING.md` (Local commands)
- Test: `pipeline/tests/test_cli_e2e.py`

**Interfaces:**
- Consumes: `write_schemas(out_dir: Path) -> list[Path]` from `contract.py`, and `Paths.default(root).schema`.
- Produces: the CLI command `schema --root PATH` (default `.`). It prints each path written and exits 0.

- [ ] **Step 1: Write failing tests:**
  - `test_schema_command_writes_files`: `CliRunner().invoke(cli.app, ["schema", "--root", str(tmp_path)])` exits 0. The files under `tmp_path / "schema"` match a `write_schemas(tmp_path / "ref")` run byte for byte, and each path appears in `result.output`.
  - In `test_committed_schema_matches_models`, change the assertion messages to the exact copy in Global Constraints.
- [ ] **Step 2:** Run `uv run pytest tests/test_cli_e2e.py -k schema -v`. FAIL (no such command).
- [ ] **Step 3: Implement** `@app.command() def schema(root: ... = Path(".")) -> None` in `cli.py`. Fix the drift test's docstring to name the command.
- [ ] **Step 4:** From `pipeline/`, run `uv run pnw-health schema --root ..`. `git status ../schema` shows no change. Then run the pipeline checks.
- [ ] **Step 5:** Under CONTRIBUTING "Local commands", add `# after a contract change\ncd pipeline && uv run pnw-health schema --root ..`.
- [ ] **Step 6:** Commit and open the PR `chore(pipeline): add a schema regeneration command`, `Part of #64`.

### Task M8.T8: Antimeridian through the loading path (#63)

**Files:**
- Modify: `pipeline/tests/helpers.py` (`make_boundary_zip`)
- Test: `pipeline/tests/sources/test_geo.py`

**Interfaces:**
- Produces: `make_boundary_zip(path: Path, fips: list[str], geometries: dict[str, BaseGeometry] | None = None) -> Path`. A FIPS listed in `geometries` gets that shape instead of the generated square. Existing callers are unchanged.

- [ ] **Step 1: Write the test** `test_antimeridian_survives_load_and_quantize`:
  - `make_boundary_zip(zip, ["02016", "53033"], {"02016": MultiPolygon([box(172, 52, 173, 53), box(-176, 51, -175, 52)])})`.
  - Then `counties = load_pnw_counties(zip)` and decode `to_topojson(counties)` with `topojson.Topology(..., object_name="counties").to_gdf()`, as the existing test does.
  - The `02016` geometry has `len(geom.geoms) == 2`, `minx < -170` and `maxx > 170`.
  - The `53033` geometry's bounds are within 0.01° of `(-120, 45, -119.5, 45.5)`.
- [ ] **Step 2:** Run it. It FAILS on the `geometries` keyword; once the helper is extended, it is expected to PASS. If it fails on an assertion, the real path loses an antimeridian part: fix that in `sources/geo.py` in this PR and note it in the PR body.
- [ ] **Step 3:** Extend `make_boundary_zip`.
- [ ] **Step 4:** Run the pipeline checks.
- [ ] **Step 5:** Commit and open the PR `test(pipeline): send an antimeridian county through the real loading path`, `Part of #63`.

### Task M8.T9: Model leakage and explanation tests (#119)

**Files:**
- Test: `pipeline/tests/model/test_cv.py`, `test_explain.py`, `test_flags.py`, `test_features.py`, `test_compare.py`
- Modify: production code only if a test exposes a bug. Note it in the PR body.

**Interfaces:**
- Consumes: `fit_ridge_oof`, `fit_lightgbm_oof`, `_oof`, `assign_folds` (`model/cv.py`), `global_importance` (`model/explain.py`), `classify` and the config's `Z_75`/`Z_90` (`model/flags.py`), `build_table`, `compare_behaviors`, `make_long` (`tests/model/synthetic.py`).

- [ ] **Step 1: Write the tests.** Each bullet is one test in the named file.
  - **`test_cv.py`**
    - `test_feature_leakage_within_held_out_fold[ridge|lightgbm]`:
      - What leaks: rows that are held out together must not influence each other's predictions, for example through imputation or scaling fitted on the test rows. Every other fold trains on `s`, so its predictions are *meant* to change, and the issue's "other folds unchanged" cannot hold. The check that means something is on `s`'s fold-mates.
      - With `make_long()`'s seven states and seed 42, fold 0 holds `06` and `02`. Take `s = "02"` and compute the fold from `assign_folds` instead of hard-coding it.
      - Copy the frame. For `s`'s rows, set the first feature column to NaN and multiply the other features by 10. Refit.
      - The fold-mates (`06`) are unchanged: `pd.testing.assert_series_equal(before[mates], after[mates], check_exact=True)`.
      - Sensitivity, so the test can't pass vacuously: `s`'s own predictions differ, and at least one county in a fold that trains on `s` differs.
    - `test_explanation_ignores_own_state_target[<each state>]`: parametrize the existing test over `make_long()`'s seven states.
    - `test_unmapped_state_raises`: `folds` missing one state gives `ModelDataError` matching `"no fold assignment"`.
    - `test_contribution_belongs_to_its_feature`:
      - `make_long()`, then overwrite the target with `78 + 2.0 * (poverty_rate - 50)` plus small noise.
      - In `fit_lightgbm_oof(...).contributions`, the column with the largest mean |contribution| is `poverty_rate`, and it is the row-wise argmax for ≥ 90% of counties.
  - **`test_explain.py`**
    - `test_global_importance_ties_break_by_name`: two columns `b` and `a` with identical |values|. The output order is `a`, `b`.
  - **`test_flags.py`**
    - `test_shuffled_index_same_flags`: `classify` on a permuted index gives `flags.flag.loc[original_index]` equal to the unshuffled result.
    - `test_zero_residuals_are_none`: residuals all 0.0 give every flag `"none"`.
    - In `test_tiers`, derive the residuals from `Z_75` and `Z_90` (for example `scale * (Z_90 + 0.01)`) instead of literals.
  - **`test_features.py`**
    - `test_asymmetric_target_ci`: set one county's target `ci_low` to `value - 1` and `ci_high` to `value + 3`. `build_table` keeps those exact bounds.
  - **`test_compare.py`**
    - `test_behaviors_model_receives_behavior_columns`:
      - `monkeypatch.setattr(compare, "fit_lightgbm_oof", spy)`, where `spy` records `list(features)` and delegates.
      - Two calls are recorded: `FEATURES`, then `[*FEATURES, *BEHAVIORS]`.
- [ ] **Step 2:** Run `uv run pytest tests/model -v`. These are expected to PASS against current code, since they pin existing behavior. Any that fails is a real bug: fix it in this PR.
- [ ] **Step 3:** Mutation check, by hand and not committed: swap two columns in `cv.fit_lightgbm_oof`'s `explain` (`columns[::-1]`). `test_contribution_belongs_to_its_feature` must FAIL. Then revert.
- [ ] **Step 4:** Run the pipeline checks.
- [ ] **Step 5:** Commit and open the PR `test(ml): strengthen leakage and explanation tests`, `Part of #119`.

### Task M8.T10: Model package errors and cleanups (#120)

**Files:**
- Create: `pipeline/src/pnw_health/numeric.py`
- Modify: `pipeline/src/pnw_health/model/features.py`, `model/flags.py`, `model/cv.py`, `model/compare.py`, `model/run.py`, `export.py`
- Test: `pipeline/tests/model/test_features.py`, `test_flags.py`, `test_cv.py`, `test_compare.py`, plus a new `pipeline/tests/test_numeric.py`

**Interfaces:**
- Produces:
  - `nan_to_none(x: object) -> float | None` in `numeric.py`: `None`, `pd.NA` and NaN give `None`; anything else gives `float(x)`. It replaces `export._num` and `run._num`.
  - `ModelTable(frame: pd.DataFrame, dropped: tuple[str, ...])`.
  - `sigma_model_sq` raises `ModelDataError("no standard errors: cannot compute sigma")` when `se.isna().all()`.
  - `score` raises `ModelDataError` on misaligned or fewer than 2 rows.
  - `EXCLUSION_REASON_ALL` and `EXCLUSION_REASON_SOME` in `compare.py` replace `EXCLUSION_REASON`. `ALL` is used when every one of the state's counties lacks every behavior measure; otherwise `SOME`. Wording:
    - ALL: `"PLACES does not report these behavior measures for this state's counties."` (today's)
    - SOME: `"PLACES is missing some of these behavior measures for this state's counties."`

- [ ] **Step 1: Write failing tests:**
  - `test_numeric.py`: `nan_to_none(None)`, `nan_to_none(pd.NA)` and `nan_to_none(float("nan"))` are `None`; `nan_to_none(1)` is `1.0`; `nan_to_none(np.float64(2.5))` is `2.5`.
  - `test_features.py::test_duplicate_rows_raise`: append a copy of one `make_long()` row. Raises `ModelDataError` naming `"<fips>/<indicator_id>"`.
  - `test_features.py::test_dropped_is_tuple`: `isinstance(build_table(make_long()).dropped, tuple)`.
  - `test_flags.py::test_all_nan_se_raises`: `sigma_model_sq(pd.Series([1.0, -1.0]), pd.Series([NAN, NAN]))` raises with the exact message.
  - `test_cv.py::test_score_aligns_on_index`: `score(actual, predicted.sample(frac=1, random_state=0))` equals `score(actual, predicted)`.
  - `test_cv.py::test_score_needs_two_rows`: one row raises `ModelDataError`. A `predicted` missing an index label of `actual` raises `ModelDataError`.
  - `test_compare.py::test_all_counties_excluded_raises`: every behavior NaN raises `ModelDataError`.
  - `test_compare.py::test_empty_fold_after_exclusion_raises`: blank behaviors for every state in one fold. Raises `ModelDataError` naming the fold.
  - `test_compare.py::test_partial_exclusion_reason`: blank one behavior for one county of a state. That state's reason is `EXCLUSION_REASON_SOME`. The existing whole-state test expects `EXCLUSION_REASON_ALL`.
- [ ] **Step 2:** Run `uv run pytest tests/model tests/test_numeric.py -v`. FAIL.
- [ ] **Step 3: Implement**, per spec §3.10:
  - In `build_table`, check `rows.duplicated(["fips", "indicator_id"], keep=False)` before the pivot. List up to 10 pairs, then `"and N more"`.
  - In `classify`, use `np.select([residuals.isna(), magnitude > t90, magnitude > t75], [...], default="none")`, with the `better` split inside each choice.
  - `score` reindexes `predicted` to `actual.index`.
  - `compare_behaviors` checks `shared` is non-empty, and that every fold value in `folds` has at least one `shared` row.
  - `ModelTable` gets a docstring noting the frame is treated as read-only.
  - `run.py` and `export.py` import `nan_to_none`.
- [ ] **Step 4:** Run the pipeline checks. Then run `uv run pnw-health run --stage model --root ..` and `--stage export`. Compare `web/public/data/model.json` with the copy saved before this task: `cmp` shows no difference.
- [ ] **Step 5:** Commit and open the PR `refactor(ml): clearer model errors and small cleanups`, `Part of #120`.

### Task M8.T11: Checkpoint report cleanups (#121)

**Files:**
- Modify: `pipeline/scripts/model_report.py`
- Test: create `pipeline/tests/test_model_report.py`, loading the script with `importlib` as `test_record_fixtures.py` does

**Interfaces:**
- Consumes: `make_model_file`, `make_county_model` (`tests/helpers.py`).
- Produces: the script's `main(argv: list[str] | None = None) -> None` (it gains `argv` so tests can call it), and `_flags_section(model, pop) -> list[str]`, with a tercile table header that adds `share among flaggable`.

- [ ] **Step 1: Write failing tests:**
  - `test_tercile_share_among_flaggable`:
    - A model with 6 counties: in one tercile, 1 flagged, 1 `none` and 1 `insufficient_data`.
    - Expect a `share flagged` of `33.3%` and a `share among flaggable` of `50.0%` in that row.
  - `test_named_shap_sorted_by_magnitude`: a named county (`53033`) whose `shap` list is stored smallest first. The section lists the largest |contribution| first.
  - `test_missing_model_json_message`:
    - `main(["--root", str(tmp_path)])` raises `SystemExit` with code 1.
    - `capsys` stderr contains `web/public/data/model.json not found; run \`pnw-health run --stage export\` first`.
    - Same for `data/interim/long.parquet` → `--stage harmonize` once `model.json` exists, and for the CHR cache → `--stage fetch`.
- [ ] **Step 2:** Run `uv run pytest tests/test_model_report.py -v`. FAIL.
- [ ] **Step 3: Implement**, per spec §3.11:
  - Replace `keys` with `[*FLAGS, "insufficient_data"]`.
  - Sort `c.shap` by `(-abs(contribution), feature)` before `[:5]`.
  - Replace `assert isinstance(rm, RegionMetrics)` with `if not isinstance(...): raise SystemExit(...)`.
  - Add a `_require(path: Path, stage: str) -> Path` that prints the message to stderr and `raise SystemExit(1)`.
- [ ] **Step 4:** Run the pipeline checks, then run `uv run python scripts/model_report.py --root ..`. It prints the report, with the new column.
- [ ] **Step 5:** Commit and open the PR `chore(ml): checkpoint report cleanups`, `Part of #121`.

### Milestone review (no issue)

- [ ] **Step 1:** On up-to-date `milestone/m8`, run the pipeline checks.
- [ ] **Step 2:** Check the exported data is unchanged:
  - Check out `origin/main` in a temporary worktree: `git worktree add ../m8-main origin/main`.
  - In each tree, run `uv run pnw-health run --stage harmonize --root <tree>`, then `--stage model`, then `--stage export`, with `data/raw` copied from this checkout.
  - Diff the four files with `jq 'del(.built_at)'` on `manifest.json` and plain `cmp` on the others. Remove the worktree afterwards.
- [ ] **Step 3:** Confirm that `ci` is green on the milestone PR and that `build-deploy` is green on `milestone/m8` (trigger it with `workflow_dispatch` on the branch if needed).
- [ ] **Step 4:** Fill in the milestone PR template:
  - every issue PR
  - `Closes #61, #66, #60, #113, #65, #100, #64, #63, #119, #120, #121`
  - the export diff output
  - the run links
- [ ] **Step 5:** Mark the PR ready for review. The author merges it with a merge commit.
