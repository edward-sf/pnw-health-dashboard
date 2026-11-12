# M8 Pipeline + Model Hardening — Design

**Date:** 2026-11-11
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§3 Data pipeline, §5 Model). M4 decisions this builds on are in `2026-11-10-m4-ml-pipeline-design.md`. This document records only what M8 decides; where it is silent, those specs apply.

## 1. Outcome

The pipeline and model package carry no open review debt from M1–M4. Failures that used to be silent or opaque (a half-written export, a missing API key, a state dropped from a source, a degenerate model input) now stop the run with a message that says what went wrong.

**Exit criteria:**
- Every issue's "Done when" (or bullet list, for #100, #119, #120, #121) is met as §3 specifies.
- `uv run pytest`, `ruff check`, `ruff format --check` and `mypy src` pass in `pipeline/`.
- `pnw-health run` from the existing raw cache succeeds, and its four export files are identical to the pre-M8 output apart from `manifest.json`'s `built_at`. M8 changes no exported data.
- `ci` and `build-deploy` are green on `milestone/m8`.

**Scope.** The eleven roadmap issues: #61, #66, #60, #113, #65, #100, #64, #63, #119, #120, #121. Pipeline, model and `pipeline/scripts/` only: no `web/` changes, no export-contract or `schema/` changes, and `SCHEMA_VERSION` stays `1.3.0`. New problems found along the way get their own issue in Backlog unless they block M8.

## 2. Spec changes

Each is made in the same PR as the code it describes.

| Spec | Section | Change | PR |
|---|---|---|---|
| Parent spec | §3 Validation | Each indicator must have at least one non-null value in every PNW state, unless the state is listed for it in `PARTIAL_STATES` (§3.5). | #65 |
| Parent spec | §3 Export | The four export files are written to a temporary directory and moved into place only after all four succeed (§3.1). | #61 |

## 3. Per-issue design

Work order: §3.1 → §3.11. Pipeline correctness bugs first (#61, #66, #60, #113, #65), then pipeline cleanups (#100, #64, #63), then the model package (#119, #120, #121). #119's tests land before #120's changes so the cleanups run against the stronger tests.

### 3.1 #61 Write export files atomically as a set

`write_exports` writes four files, not the three the issue names: `manifest.json`, `values.json`, `counties.topojson` and `model.json`. All four are covered.

**Change:** `write_exports` creates a temporary directory next to `out_dir` (`tempfile.mkdtemp(dir=out_dir.parent, prefix=f".{out_dir.name}-export-")`), so it is on the same filesystem and `os.replace` is a rename. It is a sibling, not a child, because `out_dir` is `web/public/data`: a directory left inside it by a killed run would be copied into the site by Vite. It writes all four files there. Only when all four writes succeed does it `os.replace` each into `out_dir`, in a fixed order. The temporary directory is removed in a `finally`, whether the writes succeeded or not. Return value and signature are unchanged.

**Limit:** the four renames are four system calls, not one atomic step. Nothing that can fail on content (serialization, a NaN, a full disk) happens between them, so the realistic failures the issue describes all leave the previous export untouched. A crash in the microseconds between two renames could still mix vintages; that is accepted.

**Test:** with a previous export in place, patch the writer so the second file raises. The four existing files are byte-identical afterwards and no `.<name>-export-*` directory remains. A second test checks the happy path leaves no temporary directory and nothing but the four files in `out_dir`.

### 3.2 #66 Fail fast when `CENSUS_API_KEY` is missing

**Change:** `_fetch` checks for the key before any request, but only when ACS will actually be downloaded: `refresh` is set, or `acs_cache_path(...)` does not exist. If the key is missing then, it raises `StageInputError("CENSUS_API_KEY not set (environment or <root>/.env)")`, with `<root>` the resolved repo root, which `run` already reports and exits 1 on. `run_pipeline` gains the root (or the message) so it can name the path. A run whose ACS cache exists, and any stage after `fetch`, needs no key.

**Tests:** no key and no ACS cache: `run --stage fetch` exits 1 with that message and makes no request (the mock transport records none). No key with a cached ACS file: fetch succeeds. No key with a cache and `--refresh`: exits 1.

### 3.3 #60 `.env` parser

**Change:** `census_api_key` strips a leading `export ` (followed by any whitespace) from the line. For the value: if it starts with a quote, it is the text up to the matching closing quote, and anything after is ignored. Otherwise an inline comment, ` #` (whitespace then `#`) to the end of the line, is removed, then the value is stripped. A `#` with no space before it stays part of an unquoted value, as in shell. Blank and `#` comment lines are skipped as today.

**Tests** in `tests/test_config.py`: `export CENSUS_API_KEY=abc`, `CENSUS_API_KEY=abc # note`, `CENSUS_API_KEY="abc # not a comment"` and `CENSUS_API_KEY=ab#c` return `abc`, `abc`, `abc # not a comment` and `ab#c`.

### 3.4 #113 Filter 2-character national FIPS rows from PLACES

**Change:** `parse_places` drops rows whose `locationid` is two digits (national and state aggregates such as `59`) before building the long frame. Any other `locationid` that is not five digits raises `FetchError` via `_invalid`, naming up to five examples. A filter that kept only five-digit rows would silently drop a county whose leading zero was lost (Alaska's `02013` arriving as `2013`), so that case fails loudly instead.

**Tests:** a row with `locationid` `59` does not appear in `parse_places` output, and every output FIPS has length 5. A row with `locationid` `2013` raises, and the message names `2013`.

### 3.5 #65 Fail validation when a state has no values for an indicator

**Decision:** a state with no values for an indicator is a validation failure, not a warning. Every current indicator covers all four states (checked against `long.parquet` on 2026-11-11: 37 indicators, no empty state), so this does not break today's run. A source that lost a whole state is exactly the regression this exists to catch.

**Change:** `validate_display` adds, for each indicator and each state in `STATES`, the problem `"<indicator_id>: no values for <ST>"` when that state's counties have no non-null value. An indicator that legitimately cannot cover a state is exempted in `PARTIAL_STATES: dict[str, frozenset[str]]` in `pnw_health/validate.py`, keyed by indicator id with state abbreviations as values. It is empty in M8. The exemption is pipeline-only: it is not in the catalog or the export contract, so the web app and `schema/` are unchanged. An id in `PARTIAL_STATES` that is not in the catalog is itself a problem, so the list cannot go stale.

The existing "no non-null values" check stays; it reads more clearly when a whole indicator is empty.

**Tests:** in `test_validate.py`, a frame where one indicator has no values for every `02` county fails with `"<id>: no values for AK"`. The same frame passes with that pair in a patched `PARTIAL_STATES`. An unknown id in `PARTIAL_STATES` fails.

### 3.6 #100 Pipeline source parsing edge cases

One fix and test per bullet:

- **CHR CI columns.** For `CHR_YEAR`, `fetch_chr`'s `needed` columns also include `<field>_cilow` and `<field>_cihigh` for every catalog indicator that expects a CI (the same rule `parse_chr` uses to read them), so a release that drops them fails validation at fetch. Test: a CHR fixture missing one CI column raises.
- **PLACES measure with no rows.** `parse_places` raises `ValueError` naming every catalog PLACES measure with no rows in the input. Test: a fixture without one catalog measure raises with that measure's id.
- **Retired FIPS constant.** `config.py` gains `VALDEZ_CORDOVA_FIPS = "02261"`. `harmonize.FIPS_SPLITS`/`LEGACY_NAMES`, `sources/chr.py` and `scripts/record_fixtures.py` use it instead of the literal.
- **Empty legacy frame dtypes.** `harmonize` builds the legacy frame with explicit dtypes (string ids and names, `Int64` year, `float64` value and CI), so an empty one round-trips through Parquet with the same schema as a populated one. Test: an empty result's dtypes equal a populated result's.
- **`record_fixtures.py chr`.** Skip blank rows when filtering, and remove the unused `year` parameter from `chr._fields` and its callers. Test in `test_record_fixtures.py`: a blank row in the input is not written.

### 3.7 #64 JSON Schema regeneration command

**Change:** a `pnw-health schema` command (`--root`, default `.`) calls `write_schemas(Paths.default(root).schema)` and prints the paths written. This is the first use of `Paths.schema`. The drift test's assertion message says `schema/ is out of date; run \`uv run pnw-health schema --root ..\` from pipeline/`. CONTRIBUTING's "Local commands" gains the same line.

**Test:** `CliRunner` runs `schema --root <tmp>` and the three schema files exist under `<tmp>/schema` and match `write_schemas` output.

### 3.8 #63 Antimeridian test through the real loading path

**Test only:** `make_boundary_zip` (in `tests/helpers.py`) takes only FIPS codes today; it gains an optional `geometries: dict[str, BaseGeometry]` argument that overrides the generated shape for those FIPS, with existing callers unchanged. Build a boundary zip with it holding an Aleutians-style MultiPolygon in EPSG:4269, with one part west of 180° and one east, plus one mainland county. Send it through `load_pnw_counties` → `to_topojson`. Assert the Aleutians county decodes to two polygon parts, one with longitudes below −170 and one above 170, and the mainland county is intact. If the real path loses a part, that is a bug and gets fixed in this PR.

### 3.9 #119 Model leakage and explanation tests

Tests only. A test that exposes a real bug gets the fix in the same PR, noted in the PR body.

- **Feature-side leakage.** Fit OOF once. Then set NaN in, and scale (×10), the features of every county in one held-out state, and fit again. The other states in that state's fold, which are held out with it, have equal OOF predictions (`check_exact=True`), so held-out rows cannot influence each other through imputation or scaling. The issue asked for "other folds unchanged", but every other fold trains on the changed state, so their predictions are meant to change. The test asserts that they do, so it cannot pass vacuously. Repeated for ridge and LightGBM.
- **Own-target explanation test.** Shift each state's targets in turn, not only state 53, and check that state's explanations are the only ones that change.
- **Contribution ↔ feature.** On synthetic data where one feature drives the target, that feature's name carries the largest |contribution| for most counties. A swap of columns in `pred_contrib` handling fails it.
- **The rest, one test each:** the unmapped-state guard in `cv._oof` raises; `global_importance` breaks ties by name; flags are unchanged under a shuffled index; zero residuals give `none` for every county; the flag test derives its z values from `model.config` instead of hard-coding them; `build_table` with an asymmetric CI; `compare_behaviors` passes the behavior columns to the fit (a spy on the fit records the columns it receives).

### 3.10 #120 Model package errors and cleanups

- **`build_table` duplicates.** Before pivoting, raise `ModelDataError` listing every duplicate `(fips, indicator_id)` pair (up to 10, then a count).
- **`flags`.** If every `se` is NaN, raise `ModelDataError("no standard errors: cannot compute sigma")`. Tier assignment uses `np.select` with the conditions in tier order; outputs are unchanged (the existing flag tests are the check).
- **`cv.score`.** Align `predicted` to `actual`'s index (`predicted.reindex(actual.index)`) and raise `ModelDataError` if any value is missing after alignment or fewer than 2 rows remain.
- **`compare_behaviors`.** Raise `ModelDataError` with a plain message when every county is excluded, or when a fold has no rows after exclusion. The exclusion reason says "missing some behavior measures" when only some of a state's counties or measures are missing, and "missing all behavior measures" otherwise.
- **`ModelTable`.** Its list field becomes a `tuple[str, ...]`. The DataFrame stays (copying it on every access is not worth it); the class docstring says it is treated as read-only.
- **`_num`.** One `nan_to_none(x: object) -> float | None` in a new `pnw_health/numeric.py`, with `export.py`'s `pd.NA` handling, replaces both copies.

**Tests:** one per raise above, plus `score` with a shuffled `predicted` index giving the same metrics as an aligned one.

### 3.11 #121 Checkpoint report script cleanups

In `pipeline/scripts/model_report.py`:
- The population-tercile table keeps "share flagged" over all counties and adds "share among flaggable", whose denominator excludes `insufficient_data`.
- The local `keys` list is replaced by the existing `FLAGS`.
- The named-county table sorts each county's SHAP contributions by |value| descending before taking the top 5.
- The bare `assert` becomes an explicit check that raises `SystemExit` with a message.
- A missing input file prints `<path> not found; run \`pnw-health run --stage <stage>\` first` (the CLI's wording) to stderr and exits 1.

**Tests:** in a new `tests/test_model_report.py`, the tercile shares on a small synthetic model file, and the missing-input exit code and message.

## 4. Testing and verification

Each issue PR runs the full pipeline checks from CONTRIBUTING locally. The milestone PR adds the from-cache `pnw-health run` and a diff of the four export files against the `main` build (ignoring `built_at`), and links green `ci` and `build-deploy` runs on `milestone/m8`. No Playwright changes: M8 touches nothing the web app renders.
