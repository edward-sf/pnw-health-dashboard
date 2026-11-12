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

**Change:** `write_exports` takes a required keyword `staging` and creates its temporary directory there (`tempfile.mkdtemp(dir=staging, prefix=".export-")`). The CLI passes `data/interim`. It must not be anywhere under `web/public/`: Vite copies that whole folder, dotfiles included, into the site, so a run killed before cleanup must not leave files there. (A first version used a sibling of `web/public/data`, which is still inside `web/public/`; the M8 final review caught it.) A `staging` inside `out_dir` is rejected with `ValueError`. All four files are written there first; only when all four writes succeed is each moved into `out_dir`, in a fixed order. On one filesystem a move is `os.replace`. Across filesystems (`EXDEV`) it copies to a hidden `.<name>.partial` beside the target and then renames that, so a reader never sees a half-written file. If a move fails, `ExportError` names the files already replaced (or says nothing was replaced) and says to re-run `--stage export`; the CLI reports it and exits 1. A failure to remove the `.partial` file only warns, so it never hides the copy error. The temporary directory is removed in a `finally`; if removal fails, a warning goes to stderr. The return value is unchanged; the signature gains the required keyword `staging`.

**Limit:** the four moves are four steps, not one atomic step. A failed *write* leaves the previous export untouched. A crash between two moves, or an error during a move (for example a full disk on the cross-filesystem copy path), can still leave a mix of old and new files; `ExportError` says so when it can. That is accepted.

**Tests:** with a previous export in place, patch the writer so the second file raises. The four existing files are byte-identical afterwards and the staging directory is empty. The happy path leaves nothing but the four files in `out_dir`. Unit tests in `test_export.py` force `EXDEV` (the files land byte-identical to a normal run, and every copy goes to a temporary name beside the target), make the third move fail (`ExportError` names `manifest.json, values.json`), reject a `staging` inside `out_dir`, and warn when cleanup fails. A CLI test in `test_cli_e2e.py` checks the export is staged in `data/interim`, outside `web/public/`.

### 3.2 #66 Fail fast when `CENSUS_API_KEY` is missing

**Change:** `_fetch` checks for the key before any request, but only when ACS will actually be downloaded: `refresh` is set, or `acs_cache_path(...)` does not exist. If the key is missing then, it raises `StageInputError("CENSUS_API_KEY not set (environment or <root>/.env)")`, which `run` already reports and exits 1 on. `run_pipeline` gains an optional `env_file` (from `config.env_file_path(root)`), used only to name that path. An environment value that is empty or whitespace counts as unset. A run whose ACS cache exists, and any stage after `fetch`, needs no key. The CLI reads the key (and so `.env`) only for `--stage fetch` and `--stage all`, so a malformed `.env` cannot block a stage that never downloads.

**Tests:** no key and no ACS cache: `run --stage fetch` exits 1 with that message and makes no request (the mock transport records none). No key with a cached ACS file: fetch succeeds. No key with a cache and `--refresh`: exits 1.

### 3.3 #60 `.env` parser

**Change:** `census_api_key` strips a leading `export ` (followed by any whitespace) from the line. For the value: if it starts with a quote, it is the text up to the matching closing quote, and anything after is ignored; an opening quote with no closing quote raises `ValueError` naming the file and line. Otherwise an inline comment, ` #` (whitespace then `#`) to the end of the line, is removed, then the value is stripped. A `#` with no space before it stays part of an unquoted value, as in shell. Blank and `#` comment lines are skipped. As in a shell, the last `CENSUS_API_KEY` line wins. The file is read as UTF-8 with an optional byte-order mark (as some Windows editors save it). A file that is not UTF-8, or that cannot be read at all, raises `ValueError` naming it.

**Tests** in `tests/test_config.py`: `export CENSUS_API_KEY=abc`, `CENSUS_API_KEY=abc # note`, `CENSUS_API_KEY="abc # not a comment"` and `CENSUS_API_KEY=ab#c` return `abc`, `abc`, `abc # not a comment` and `ab#c`. Two entries return the last; an empty entry followed by a value returns the value; a byte-order mark is ignored; an unclosed quote, a non-UTF-8 file and an unreadable `.env` raise. CLI tests show a broken `.env` fails `--stage fetch` but not `--stage harmonize`.

### 3.4 #113 Filter 2-character national FIPS rows from PLACES

**Change:** `parse_places` drops rows whose `locationid` is two digits (national and state aggregates such as `59`) before building the long frame. Any other `locationid` that is not five digits raises `FetchError` via `_invalid`, naming up to five examples. A filter that kept only five-digit rows would silently drop a county whose leading zero was lost (Alaska's `02013` arriving as `2013`), so that case fails loudly instead.

**Tests:** a row with `locationid` `59` does not appear in `parse_places` output, and every output FIPS has length 5. A row with `locationid` `2013` raises, and the message names `2013`.

### 3.5 #65 Fail validation when a state has no values for an indicator

**Decision:** a state with no values for an indicator is a validation failure, not a warning. Every current indicator covers all four states (checked against `long.parquet` on 2026-11-11: 37 indicators, no empty state), so this does not break today's run. A source that lost a whole state is exactly the regression this exists to catch.

**Change:** `validate_display` adds, for each indicator and each state in `STATES`, the problem `"<indicator_id>: no values for <ST>"` when that state's counties have no non-null value. An indicator that legitimately cannot cover a state is exempted in `PARTIAL_STATES: dict[str, frozenset[str]]` in `pnw_health/validate.py`, keyed by indicator id with state abbreviations as values. It is empty in M8. The exemption is pipeline-only: it is not in the catalog or the export contract, so the web app and `schema/` are unchanged. An id in `PARTIAL_STATES` that is not in the catalog is itself a problem, so the list cannot go stale. Each abbreviation in it must be a PNW state, and an exemption for a state that does have values is a problem too ("remove the exemption"), so a stale exemption cannot hide a later regression.

The existing "no non-null values" check stays; it reads more clearly when a whole indicator is empty.

**Tests:** in `test_validate.py`, a frame where one indicator has no values for every `02` county fails with `"<id>: no values for AK"`, as does one whose `02` rows are all null. The same frame passes with that pair in a patched `PARTIAL_STATES`. An unknown id, a non-PNW abbreviation, and an exemption for a state that has values each fail. `PARTIAL_STATES` being empty is pinned by a deliberate tripwire test.

### 3.6 #100 Pipeline source parsing edge cases

One fix and test per bullet:

- **CHR CI columns.** For `CHR_YEAR`, `fetch_chr`'s `needed` columns also include `<field>_cilow` and `<field>_cihigh` for every catalog indicator that expects a CI (the same rule `parse_chr` uses to read them), so a release that drops them fails validation at fetch. Test: a CHR fixture missing one CI column raises.
- **PLACES measure with no rows.** `parse_places` raises `FetchError` via `_invalid` (with its `--refresh` hint), naming every catalog PLACES measure with no rows in the input. Test: a fixture missing two catalog measures raises naming both.
- **Retired FIPS constant.** `config.py` gains `VALDEZ_CORDOVA_FIPS = "02261"`. `harmonize.FIPS_SPLITS`/`LEGACY_NAMES`, `sources/chr.py` and `scripts/record_fixtures.py` use it instead of the literal.
- **Empty legacy frame dtypes.** `harmonize` builds the legacy frame with explicit `LEGACY_DTYPES` (pandas `string` ids and names, `int64` year, `float64` value and CI), and `LEGACY_COLUMNS` is derived from it. An empty `object` column is written to Parquet as type null, so the text columns use `string` for an empty frame to round-trip with the same schema as a populated one. Exported data is unchanged. Test: an empty and a populated result written to Parquet have the same schema.
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
