# M1 Pipeline Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is one GitHub Issue (`M1.T<k>`) and one issue PR into `milestone/m1`. The milestone ends with a single milestone PR `milestone/m1 → main` for the author to review. Follow `CONTRIBUTING.md` for branch, PR, and merge rules. M1 has no CI yet, so each issue PR's checks are run locally: `uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src`. A task's final "Commit" step is followed by its issue PR.

**Goal:** `pnw-health run` fetches Census ACS data and county boundaries, harmonizes them, validates them, and exports `manifest.json`, `values.json`, and `counties.topojson`, plus committed JSON Schema files.

**Architecture:** This is a Python package in `pipeline/` with these stages: fetch (cached raw files in `data/raw/`), harmonize (a tidy long table in `data/interim/`), and export (validate, rank, write web artifacts to `web/public/data/`). Source modules know about the APIs. Everything downstream sees only the long table and the indicator catalog. Pydantic models define the export contract and generate JSON Schema for the web app (M2).

**Tech Stack:** Python 3.12, uv, httpx, pandas, pyarrow, pydantic v2, PyYAML, typer, geopandas + pyogrio, topojson; pytest, ruff, mypy.

**Spec:** `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md` (§2 architecture, §3 data/harmonization/validation, §4 contract). **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`.

## Global Constraints

- Python `>=3.12,<3.13`, managed with uv. `uv.lock` is committed.
- FIPS codes are always 5-character zero-padded **strings** (`"02013"`, never `2013`).
- Display set: exactly 149 county-equivalents; WA (`53`) 39, OR (`41`) 36, ID (`16`) 44, AK (`02`) 30.
- Sources are fetched **nationally** (all counties), because M4 trains on them. Display and validation use the 149 only.
- Geography: 2020-vintage FIPS; boundaries from Census cartographic file `cb_2024_us_county_5m.zip`.
- ACS: 5-year **Data Profile** (`acs/acs5/profile`), `ACS_YEAR = 2024`. ACS MOEs are 90% intervals, so `ci_level = 0.90`, `ci_low = v − moe`, `ci_high = v + moe`.
- Suppressed or missing values stay `null`. Never impute for display.
- Alaska: rename `02270 → 02158`. Split `02261 → (02063, 02066)`, with legacy name `"Valdez-Cordova Census Area (former)"`.
- Tests never touch the network. All HTTP in tests goes through `httpx.MockTransport` and recorded fixtures.
- `data/` and `web/public/data/` are git-ignored. `schema/` (repo root) is committed.
- Contract `SCHEMA_VERSION = "1.0.0"`.

## Review Focus

1. **Census annotation sentinels.** ACS returns values like `-666666666` or `-888888888` for "not available." They must become `null`, never a huge negative value that passes into ranks. *(Test in T4.)*
2. **Leading zeros in FIPS.** Alaska's state code `"02"` read as an integer becomes `"2"`, and the county silently disappears from the 149. *(Tests in T4, T5.)*
3. **Interrupted downloads.** A killed fetch must not leave a partial file that later runs treat as a valid cache. *(Test in T3.)*
4. **Census API errors.** The Census API returns HTTP 400/204 with a plain-text body for bad variables or keys. That must raise a clear `FetchError` naming the URL, not a JSON decode traceback. *(Test in T3.)*
5. **The Aleutians cross the antimeridian.** Aleutians West (`02016`) has parts at positive longitudes. TopoJSON conversion must keep them, not drop them or wrap them into a band spanning the whole globe. *(Test in T6.)*

---

### Task M1.T1: Scaffold pipeline package and shared config

**Files:**
- Create: `pipeline/pyproject.toml`, `pipeline/src/pnw_health/__init__.py`, `pipeline/src/pnw_health/config.py`, `pipeline/src/pnw_health/sources/__init__.py`, `pipeline/tests/test_config.py`
- Modify: `.gitignore` (add `data/`, `web/public/data/`)

**Interfaces:**
- Produces (`config.py`):
  - `STATES: dict[str, str] = {"53": "WA", "41": "OR", "16": "ID", "02": "AK"}`
  - `EXPECTED_COUNTY_COUNTS: dict[str, int] = {"WA": 39, "OR": 36, "ID": 44, "AK": 30}`
  - `ACS_YEAR = 2024`, `GEO_YEAR = 2024`, `SCHEMA_VERSION = "1.0.0"`
  - `@dataclass(frozen=True) class Paths: raw: Path; interim: Path; out: Path; schema: Path` with `Paths.default(repo_root: Path) -> Paths` returning `data/raw`, `data/interim`, `web/public/data`, `schema`.
  - `def state_abbr(fips: str) -> str | None`: the state for a 5-char FIPS, or `None` if outside the PNW.

- [ ] **Step 1:** Run `uv init --package --name pnw-health --python 3.12 pipeline`. Add the runtime dependencies `httpx pandas pyarrow "pydantic>=2" pyyaml typer geopandas pyogrio topojson` and the dev dependencies `pytest ruff mypy pandas-stubs types-PyYAML`. Configure ruff (`line-length = 100`, rules `E,F,I,UP,B`), mypy (`strict = true`, `ignore_missing_imports = true` for geopandas/topojson), and the console script `pnw-health = "pnw_health.cli:app"`.
- [ ] **Step 2: Write failing tests** in `tests/test_config.py`:

```python
def test_expected_total_is_149():
    assert sum(EXPECTED_COUNTY_COUNTS.values()) == 149

def test_state_abbr():
    assert state_abbr("02013") == "AK"
    assert state_abbr("53033") == "WA"
    assert state_abbr("06037") is None

def test_default_paths(tmp_path):
    p = Paths.default(tmp_path)
    assert p.out == tmp_path / "web" / "public" / "data"
    assert p.schema == tmp_path / "schema"
```

- [ ] **Step 3:** Run `cd pipeline && uv run pytest tests/test_config.py -v`. Expected: FAIL (ImportError).
- [ ] **Step 4:** Implement `config.py` per Interfaces.
- [ ] **Step 5:** Run `uv run pytest && uv run ruff check && uv run mypy src`. Expected: all pass.
- [ ] **Step 6:** Commit: `chore(pipeline): scaffold package and config`.

### Task M1.T2: Indicator catalog (ACS subset)

**Files:**
- Create: `pipeline/src/pnw_health/indicators.py`, `pipeline/src/pnw_health/indicators.yaml`, `pipeline/tests/test_indicators.py`, `pipeline/tests/fixtures/acs_profile_variables_2024.json`, `pipeline/scripts/record_fixtures.py`

**Interfaces:**
- Produces:
  - `Unit = Literal["percent", "dollars", "years", "rate_per_100k", "count"]`
  - `Category = Literal["Outcomes", "Behaviors", "Access", "Social & Economic", "Demographics"]`
  - `Direction = Literal["higher_is_better", "higher_is_worse", "neutral"]`
  - `class Indicator(BaseModel)` (frozen) with fields `id: str` (snake_case, unique), `label: str`, `unit: Unit`, `source: Literal["acs", "places", "chr"]`, `source_field: str`, `moe_field: str | None`, `ci_level: float | None`, `year: int`, `category: Category`, `direction: Direction`, `description: str`
  - `def load_catalog(path: Path | None = None) -> list[Indicator]`: defaults to the packaged `indicators.yaml`. Raises `ValueError` on duplicate ids.
- M1 catalog contents (all `source: acs`, `year: 2024`, `ci_level: 0.9`):

| id | unit | category | direction |
|---|---|---|---|
| `median_household_income` | dollars | Social & Economic | higher_is_better |
| `poverty_rate` | percent | Social & Economic | higher_is_worse |
| `unemployment_rate` | percent | Social & Economic | higher_is_worse |
| `bachelors_or_higher` | percent | Social & Economic | higher_is_better |
| `uninsured_rate` | percent | Access | higher_is_worse |
| `broadband_households` | percent | Access | higher_is_better |

  Data Profile variable codes shift between ACS years, so **don't copy codes from memory**. Look each one up by label in `https://api.census.gov/data/2024/acs/acs5/profile/variables.json`. Use the `...PE` (percent) estimate for percentages and `...E` for income. The MOE field swaps the final `E` for `M` (`PE → PM`, `E → M`).

- [ ] **Step 1:** Write `scripts/record_fixtures.py` with a `variables` subcommand. It downloads `variables.json` and saves to `tests/fixtures/acs_profile_variables_2024.json` only the entries for the catalog's `source_field` and `moe_field` codes. This script is the only code that touches the network outside the CLI.
- [ ] **Step 2: Write failing tests:**

```python
def test_catalog_loads_and_ids_unique():
    cat = load_catalog()
    assert len(cat) == 6
    assert len({i.id for i in cat}) == 6

def test_duplicate_ids_rejected(tmp_path):  # two entries with same id -> ValueError

def test_acs_fields_exist_and_labels_match(acs_variables):
    # acs_variables: fixture dict loaded from the recorded JSON
    for ind in load_catalog():
        assert ind.source_field in acs_variables
        assert ind.moe_field in acs_variables
        assert "Margin of Error" in acs_variables[ind.moe_field]["label"]
        assert "Margin of Error" not in acs_variables[ind.source_field]["label"]
```

  Add one explicit label assertion per indicator, such as `"Median household income"` in the income label and `"below the poverty level"` in the poverty label. That pins each code to its meaning.
- [ ] **Step 3:** Run `uv run pytest tests/test_indicators.py -v`. Expected: FAIL.
- [ ] **Step 4:** Implement `indicators.py`, write `indicators.yaml` with codes found by label, and run `uv run python scripts/record_fixtures.py variables`.
- [ ] **Step 5:** Run `uv run pytest tests/test_indicators.py -v`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(pipeline): indicator catalog with ACS subset`.

### Task M1.T3: Fetch and cache layer

**Files:**
- Create: `pipeline/src/pnw_health/fetch.py`, `pipeline/tests/test_fetch.py`

**Interfaces:**
- Produces:
  - `class FetchError(Exception)`. Its message includes the URL (with any `key` param redacted), the status, and the first 200 characters of the body.
  - `def make_client(transport: httpx.BaseTransport | None = None) -> httpx.Client`: timeout 60 s, `User-Agent: pnw-health-dashboard-pipeline`, follows redirects.
  - `def cached_get(client: httpx.Client, url: str, dest: Path, *, params: dict[str, str] | None = None, refresh: bool = False) -> Path`. Returns `dest` without a request when it exists and `refresh` is false. Otherwise it downloads to `dest.with_suffix(dest.suffix + ".part")` and then `os.replace` moves it to `dest`. On any non-2xx status, or on 204, it raises `FetchError` and leaves no `dest` and no `.part` file.

- [ ] **Step 1: Write failing tests** (with `httpx.MockTransport`):
  - `test_downloads_and_caches`: the handler counts calls. Calling twice gives 1 call and identical bytes.
  - `test_refresh_refetches`: `refresh=True` → 2 calls.
  - `test_http_error_raises_and_leaves_nothing`: the handler returns `400`, `"error: unknown variable 'DP99'"`. Assert `FetchError` is raised, its message contains `"400"` and `"unknown variable"`, and neither `dest` nor `dest.part` exists.
  - `test_204_is_error`: the Census API returns 204 for empty geography. Expect `FetchError`.
  - `test_api_key_redacted_in_error`: `params={"key": "SECRET"}` with a 400 response, and `"SECRET" not in str(err)`.
  - `test_interrupted_write_does_not_poison_cache`: the handler streams a body whose iterator raises midway. Assert the exception propagates, `dest` doesn't exist, and a later successful call writes `dest`.
- [ ] **Step 2:** Run `uv run pytest tests/test_fetch.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `fetch.py` per Interfaces. Use `client.stream("GET", ...)` and write chunks to the `.part` file. Unlink `.part` in a `finally` block if the replace didn't happen.
- [ ] **Step 4:** Run `uv run pytest tests/test_fetch.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pipeline): cached, atomic HTTP fetch layer`.

### Task M1.T4: ACS source

**Files:**
- Create: `pipeline/src/pnw_health/sources/acs.py`, `pipeline/tests/sources/test_acs.py`, `pipeline/tests/fixtures/acs_profile_2024_sample.json`
- Modify: `pipeline/scripts/record_fixtures.py` (add an `acs` subcommand)

**Interfaces:**
- Consumes: `cached_get`, `FetchError` (T3); `Indicator`, `load_catalog` (T2); `ACS_YEAR` (T1).
- Produces:
  - `LONG_COLUMNS: list[str] = ["fips", "indicator_id", "year", "value", "ci_low", "ci_high", "source"]` (defined in `pnw_health/long.py` so every source shares it; create that file here)
  - `CENSUS_SENTINELS: frozenset[float] = frozenset({-111111111, -222222222, -333333333, -555555555, -666666666, -888888888, -999999999})`
  - `def fetch_acs(client: httpx.Client, raw_dir: Path, catalog: list[Indicator], *, year: int = ACS_YEAR, api_key: str | None = None, refresh: bool = False) -> Path`. It requests `https://api.census.gov/data/{year}/acs/acs5/profile` with `get=NAME,<fields>` and `for=county:*` (national). It saves to `raw_dir/"acs"/f"acs5_profile_{year}.json"`, and raises `ValueError` if there are more than 49 fields.
  - `def parse_acs(path: Path, catalog: list[Indicator]) -> pd.DataFrame`: returns `LONG_COLUMNS`, one row per county × ACS indicator. `fips = state.zfill(2) + county.zfill(3)`. Values and MOEs are parsed as floats. Sentinels and unparseable values become `NaN`, and the CI is `NaN` when either the value or the MOE is `NaN`. `source = "acs"`.

- [ ] **Step 1:** Add `record_fixtures.py acs`. It fetches the catalog fields for `for=county:*&in=state:53,41,16,02` plus two non-PNW counties (`06037`, `36061`), and writes `tests/fixtures/acs_profile_2024_sample.json`. Run it once and commit the fixture. The end-to-end test in T9 uses this fixture.
- [ ] **Step 2: Write failing tests:**
  - `test_parse_shape`: on the fixture, `set(df.columns) == set(LONG_COLUMNS)`, `df.fips.str.len().eq(5).all()`, and the row count is `151 * 6`.
  - `test_alaska_fips_zero_padded`: given a tiny inline JSON `[["NAME","DP03_0062E",...,"state","county"],["Juneau...","90000",...,"2","110"]]` with an unpadded state, the parsed row has `fips == "02110"`.
  - `test_sentinels_become_null`: a value of `"-666666666"` gives `value` NaN, and an MOE of `"-555555555"` gives `ci_low`/`ci_high` NaN while `value` is kept.
  - `test_ci_from_moe`: value `"12.5"` and MOE `"1.5"` give `ci_low == 11.0` and `ci_high == 14.0`.
  - `test_fetch_acs_requests_national_profile`: MockTransport asserts the path `/data/2024/acs/acs5/profile`, `for=county:*`, no `in` param, and that `key` is present only when `api_key` is given.
  - `test_too_many_fields_rejected`: a catalog with 25 indicators (50 fields + NAME) raises `ValueError`.
- [ ] **Step 3:** Run `uv run pytest tests/sources/test_acs.py -v`. Expected: FAIL.
- [ ] **Step 4:** Implement `long.py` and `sources/acs.py` per Interfaces. Read every cell as a string, never as an inferred int.
- [ ] **Step 5:** Run `uv run pytest tests/sources/test_acs.py -v`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(pipeline): ACS data profile source`.

### Task M1.T5: Harmonize FIPS and Alaska geography changes

**Files:**
- Create: `pipeline/src/pnw_health/harmonize.py`, `pipeline/tests/test_harmonize.py`

**Interfaces:**
- Consumes: `LONG_COLUMNS` (T4), `state_abbr` (T1).
- Produces:
  - `FIPS_RENAMES: dict[str, str] = {"02270": "02158"}`
  - `FIPS_SPLITS: dict[str, tuple[str, ...]] = {"02261": ("02063", "02066")}`
  - `LEGACY_NAMES: dict[str, str] = {"02261": "Valdez-Cordova Census Area (former)"}`
  - `LEGACY_COLUMNS = ["fips", "indicator_id", "legacy_fips", "legacy_name", "value", "ci_low", "ci_high"]`
  - `@dataclass class HarmonizeResult: values: pd.DataFrame` (LONG_COLUMNS, national, with renames applied and split codes removed), `legacy: pd.DataFrame` (LEGACY_COLUMNS, `fips` = successor code), `warnings: list[str]`
  - `def harmonize(frames: list[pd.DataFrame]) -> HarmonizeResult`: concatenates the source frames, applies renames, then handles splits for each indicator. If any successor has a row for that indicator, the legacy row is dropped. Otherwise one legacy row is added per successor, the legacy row is dropped from `values`, and the function appends the warning `f"{indicator_id}: reported only for {legacy_fips}; successors {successors} set to null with legacy reference"`. It raises `ValueError` on duplicate `(fips, indicator_id)` keys after renaming.
  - `def pnw_only(df: pd.DataFrame) -> pd.DataFrame`: keeps rows where `state_abbr(fips)` isn't `None`.

- [ ] **Step 1: Write failing tests** (with small inline DataFrames):
  - `test_rename_wade_hampton`: a `02270` row comes out as `02158` with the same value.
  - `test_split_only_legacy_reported`: an `02261` row for `x` gives no `02261`/`02063`/`02066` rows for `x` in `values`, two legacy rows (`02063`, `02066`) carrying the value, CIs and name, and one warning.
  - `test_split_successors_reported_drops_legacy`: rows for `02261`, `02063` and `02066` give a `values` frame keeping only the successors, and an empty `legacy` frame.
  - `test_duplicate_after_rename_raises`: rows for both `02270` and `02158` for the same indicator raise `ValueError`.
  - `test_pnw_only_keeps_alaska`: input `["02013","53033","06037"]` gives `["02013","53033"]`.
- [ ] **Step 2:** Run `uv run pytest tests/test_harmonize.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `harmonize.py` per Interfaces.
- [ ] **Step 4:** Run `uv run pytest tests/test_harmonize.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pipeline): harmonize FIPS and Alaska geography changes`.

### Task M1.T6: County boundaries → TopoJSON

**Files:**
- Create: `pipeline/src/pnw_health/sources/geo.py`, `pipeline/tests/sources/test_geo.py`, `pipeline/tests/helpers.py` (synthetic boundary zip builder shared with T9)

**Interfaces:**
- Consumes: `cached_get` (T3), `STATES`, `GEO_YEAR` (T1).
- Produces:
  - `def fetch_boundaries(client: httpx.Client, raw_dir: Path, *, year: int = GEO_YEAR, refresh: bool = False) -> Path`: downloads `https://www2.census.gov/geo/tiger/GENZ{year}/shp/cb_{year}_us_county_5m.zip` to `raw_dir/"geo"/`.
  - `def load_pnw_counties(zip_path: Path) -> gpd.GeoDataFrame`: reads the zip with pyogrio. Columns are `fips` (from `GEOID`), `name` (from `NAMELSAD`), `state` (abbr) and `geometry`, filtered to `STATES`, reprojected to EPSG:4326 and sorted by `fips`.
  - `def to_topojson(gdf: gpd.GeoDataFrame, *, toposimplify: float = 0.002, prequantize: int = 100_000) -> dict[str, Any]`: a TopoJSON dict with a single object named `"counties"`, whose properties are `fips`, `name` and `state`.
  - `tests/helpers.py`: `def make_boundary_zip(path: Path, fips: list[str]) -> Path` writes a shapefile zip of small square polygons, one per FIPS, with Census column names (`GEOID`, `NAMELSAD`, `STATEFP`) in EPSG:4269.

- [ ] **Step 1: Write failing tests:**
  - `test_load_filters_and_columns`: a synthetic zip with `["02013","53033","06037"]` gives 2 rows, columns `["fips","name","state","geometry"]`, CRS `EPSG:4326`, and states `["AK","WA"]`.
  - `test_topojson_object_and_properties`: the output has `"counties"` in `objects`, and each geometry's properties include `fips`, `name` and `state`.
  - `test_antimeridian_parts_preserved`: a MultiPolygon for `02016` with one part at lon 172–173 and one at −176 to −175 converts to TopoJSON and back (`topojson`'s `to_gdf()`). The result has bounds `minx < -170` and `maxx > 170` and still has 2 parts.
  - `test_fetch_boundaries_url`: MockTransport asserts the exact URL path `/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip`.
- [ ] **Step 2:** Run `uv run pytest tests/sources/test_geo.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `geo.py` and `helpers.py` per Interfaces.
- [ ] **Step 4:** Run `uv run pytest tests/sources/test_geo.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pipeline): county boundaries and TopoJSON export`.

### Task M1.T7: Validation checks

**Files:**
- Create: `pipeline/src/pnw_health/validate.py`, `pipeline/tests/test_validate.py`

**Interfaces:**
- Consumes: `EXPECTED_COUNTY_COUNTS`, `state_abbr` (T1); `Indicator` (T2); `LONG_COLUMNS` (T4).
- Produces:
  - `class DataValidationError(Exception)` with an attribute `problems: list[str]`. Its `str()` joins the problems with newlines.
  - `def validate_display(values: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]) -> None`. `values` is already filtered to the PNW. The function collects **all** problems, then raises once. Checks:
    1. `len(county_fips) == 149` and the per-state counts equal `EXPECTED_COUNTY_COUNTS`. Problem text: `"county count AK: expected 30, got 29"`.
    2. Every `values.fips` is in `county_fips`.
    3. No duplicate `(fips, indicator_id)`.
    4. Values with `unit == "percent"` are in `[0, 100]`. Values with `dollars`, `count` or `rate_per_100k` are `>= 0`. NaN is allowed.
    5. Every catalog indicator has at least one non-null value.

- [ ] **Step 1: Write failing tests.** Use a helper that builds a valid 149-county frame for a 2-indicator catalog. That frame passes. Then add one test per check that breaks only that check and asserts the raised problem text. Finally add `test_collects_all_problems`, which breaks checks 1 and 4 together and expects `len(err.problems) == 2`.
- [ ] **Step 2:** Run `uv run pytest tests/test_validate.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `validate.py` per Interfaces.
- [ ] **Step 4:** Run `uv run pytest tests/test_validate.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pipeline): pre-export validation checks`.

### Task M1.T8: Contract, ranks, and export

**Files:**
- Create: `pipeline/src/pnw_health/contract.py`, `pipeline/src/pnw_health/ranks.py`, `pipeline/src/pnw_health/export.py`, `pipeline/tests/test_contract.py`, `pipeline/tests/test_ranks.py`, `pipeline/tests/test_export.py`, `schema/manifest.schema.json`, `schema/values.schema.json`

**Interfaces:**
- Consumes: `Indicator` (T2); `HarmonizeResult`/`LEGACY_COLUMNS` (T5); `SCHEMA_VERSION`, `Paths`, `state_abbr` (T1).
- Produces (`contract.py`):
  - `class SourceVintage(BaseModel): source: str; year: int; url: str`
  - `class Manifest(BaseModel): schema_version: str; built_at: datetime; sources: list[SourceVintage]; indicators: list[Indicator]`
  - `class Legacy(BaseModel): fips: str; name: str; v: float | None; lo: float | None; hi: float | None`
  - `class ValueEntry(BaseModel): v: float | None; lo: float | None; hi: float | None; rank: int | None; state_rank: int | None; legacy: Legacy | None = None`, serialized with `exclude_none` only for `legacy`. The other nulls are emitted explicitly.
  - `class ValuesFile(RootModel[dict[str, dict[str, ValueEntry]]])`, keyed by `indicator_id → fips`
  - `def write_schemas(schema_dir: Path) -> list[Path]`: writes `manifest.schema.json` and `values.schema.json` (`model_json_schema()`, `indent=2`, sorted keys).
- Produces (`ranks.py`):
  - `def add_ranks(values: pd.DataFrame, catalog: list[Indicator]) -> pd.DataFrame` adds the columns `rank` and `state_rank` (nullable `Int64`). Rank 1 = best. `higher_is_better` sorts descending, `higher_is_worse` sorts ascending, and ties use competition ranking (`method="min"`). Ranks are null when the value is NaN or the indicator is `neutral`. `state_rank` is computed within each state.
- Produces (`export.py`):
  - `def build_values_file(values: pd.DataFrame, legacy: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]) -> ValuesFile`. **Every** catalog indicator × **every** county in `county_fips` gets an entry. Missing rows become all-null entries. A legacy row attaches `Legacy` to its successor's entry.
  - `def write_exports(out_dir: Path, manifest: Manifest, values: ValuesFile, topology: dict[str, Any]) -> list[Path]`: writes `manifest.json`, `values.json` and `counties.topojson` as compact JSON (`separators=(",", ":")`). NaN is never written. It asserts a value is `None` before serializing.

- [ ] **Step 1: Write failing tests:**
  - `test_ranks.py`: in the `higher_is_better` case, values `[3, 1, 2]` get ranks `[1, 3, 2]`. In `higher_is_worse` they get `[3, 1, 2]`. Ties `[5, 5, 1]` (better) get `[1, 1, 3]`. A NaN value gets rank `<NA>` and the others rank as though it were absent. A neutral indicator has all ranks `<NA>`. `state_rank` is computed independently for 2 WA and 2 OR counties.
  - `test_export.py`: `build_values_file` with 3 counties, where one has no row, gives 3 entries, and the missing one has `v is None` and `rank is None`. A legacy row for `02063` gives `entry.legacy.fips == "02261"` and `entry.v is None`. `write_exports` output passes `json.loads` with no `NaN` token in the text, and `values.json` round-trips through `ValuesFile.model_validate_json`.
  - `test_contract.py`, `test_committed_schema_matches_models`: running `write_schemas(tmp_path)` gives files byte-identical to `<repo>/schema/*.json`. This is the drift guard for the web types.
- [ ] **Step 2:** Run `uv run pytest tests/test_ranks.py tests/test_export.py tests/test_contract.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `contract.py`, `ranks.py` and `export.py` per Interfaces. Then generate the committed schemas with `uv run python -c "from pnw_health.contract import write_schemas; from pathlib import Path; write_schemas(Path('../schema'))"`.
- [ ] **Step 4:** Run the same pytest command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pipeline): export contract, ranks, and writers`.

### Task M1.T9: CLI and end-to-end run

**Files:**
- Create: `pipeline/src/pnw_health/cli.py`, `pipeline/tests/test_cli_e2e.py`
- Modify: `README.md` (add a short "Run the pipeline" section)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `app = typer.Typer()` with the command `run(stage: Stage = Stage.all, root: Path = Path("."), refresh: bool = False)`, where `class Stage(str, Enum): fetch, harmonize, export, all`.
    - `fetch` calls `fetch_acs` and `fetch_boundaries`, reading the API key from the env var `CENSUS_API_KEY` (optional).
    - `harmonize` runs `parse_acs` and `harmonize`, then writes `interim/long.parquet`, `interim/legacy.parquet` and `interim/warnings.txt`.
    - `export` loads the interim files and boundaries, runs `pnw_only`, `validate_display` and `add_ranks`, then calls `build_values_file`, `to_topojson` and `write_exports`. The manifest's `sources` are ACS (`year=ACS_YEAR`, profile URL) and boundaries (`year=GEO_YEAR`, zip URL).
    - On `DataValidationError` or `FetchError`, it prints the problems to stderr and exits with code 1, writing no export files. The writers run only after validation passes.
  - `def run_pipeline(paths: Paths, stage: Stage, *, client: httpx.Client, refresh: bool = False) -> None`: the testable core. `run` builds the client and paths and calls it.

- [ ] **Step 1: Write failing tests** in `test_cli_e2e.py`. Use a MockTransport that serves `acs_profile_2024_sample.json` for the ACS URL and a `make_boundary_zip` of the fixture's 149 PNW FIPS plus `06037` for the boundary URL.
  - `test_full_run_produces_valid_exports`: `run_pipeline(Paths.default(tmp_path), Stage.all, client=...)` writes the three files. `Manifest.model_validate_json` and `ValuesFile.model_validate_json` both succeed. `values.json` has 6 indicators × 149 FIPS. `counties.topojson` has 149 geometries.
  - `test_validation_failure_writes_nothing`: the boundary zip is missing one AK county, so a `DataValidationError` mentioning `"AK: expected 30, got 29"` is raised and `paths.out` contains no files.
  - `test_cli_exit_code`: typer's `CliRunner`, with `run_pipeline` monkeypatched to raise `DataValidationError(["x"])`, gives exit code 1 and `"x"` in the output.
  - `test_stages_are_resumable`: after running `fetch` with the transport, the `harmonize` and `export` stages succeed with a transport that fails every request (the cache is used).
- [ ] **Step 2:** Run `uv run pytest tests/test_cli_e2e.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `cli.py` per Interfaces.
- [ ] **Step 4:** Run the full suite and checks: `uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src`. Expected: all pass.
- [ ] **Step 5: Live run.** From the repo root, run `cd pipeline && uv run pnw-health run --root ..`. Expected: exit 0. `web/public/data/` contains the three files, and `data/interim/warnings.txt` exists (it may be empty). Spot-check that `values.json` has non-null `median_household_income` for `53033` (King County), and that every `02xxx` key is present.
- [ ] **Step 6:** Add the README section with the command above, and commit: `feat(pipeline): CLI with resumable stages and end-to-end test`.
