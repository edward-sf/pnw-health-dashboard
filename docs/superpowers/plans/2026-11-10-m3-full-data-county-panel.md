# M3 Full Data + County Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is one GitHub Issue (`M3.T<k>`) and one issue PR into `milestone/m3`. The milestone ends with a single milestone PR `milestone/m3 → main` for the author to review. Follow `CONTRIBUTING.md` for branch, PR, and merge rules. A task's final "Commit" step is followed by its issue PR.

**Goal:** The site offers 37 indicators from ACS, PLACES and CHR, with a county panel, strip plot, "Who lives here," table view and keyboard-accessible county search.

**Architecture:** Two new source modules produce the existing long format and feed the existing `harmonize()`. A CHR 2023 frame holding only retired-FIPS rows makes the existing split logic attach labeled legacy values. On the web, pure functions own the logic (`rankSummary`, `buildStripData`, `sortRows`), thin React components render their results, and all selection state stays in the URL.

**Tech Stack:** Python 3.12, pandas, httpx, Pydantic; React 19, TypeScript 6.0, React Router 8, `@observablehq/plot` 0.6.19; Vitest 5, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-m3-full-data-county-panel-design.md`, with parent `docs/superpowers/specs/2026-11-10-pnw-health-dashboard-design.md`. **Roadmap:** `docs/superpowers/plans/2026-11-10-roadmap.md`.

## Global Constraints

- All M2 plan constraints still apply: FIPS are 5-character strings, TypeScript stays `~6.0.3`, import from `react-router`, and every URL goes through `import.meta.env.BASE_URL`.
- Null is not zero. Test `v === null`; use `??`, never `||`, on values.
- Tests never touch the network. `make_client` refuses redirects; CHR and PLACES were checked to answer 200 directly.
- Append new catalog entries after the existing ones, so the default indicator stays `median_household_income`.
- `ci_level` is a fraction (0.9, 0.95). Display it as `Math.round(ci_level * 100)`.
- Regenerate schemas after any contract change: `cd pipeline && uv run python -c "from pathlib import Path; from pnw_health.contract import write_schemas; write_schemas(Path('../schema'))"`.
- Fixtures are re-recorded with `scripts/record_fixtures.py`. No raw or exported data is committed outside `tests/fixtures/`.
- Pipeline checks: `cd pipeline && uv run ruff check && uv run ruff format --check && uv run mypy src && uv run pytest`. Web checks: `cd web && npm run lint && npm run typecheck && npm test`.

## Review Focus

1. **True zero shown as missing.** A county with 0.0% must get a strip-plot dot, a sorted table position and a "0.0%" share, not "not available." *(Tests in T6, T7, T8.)*
2. **CI level display.** Real data has `ci_level: 0.9`; the panel must say "90% CI," not "1% CI" or "0.9% CI." *(Test in T5; the web fixture changes from 90 to 0.9.)*
3. **Changing indicator with a county selected.** Moving from a value to a null, legacy or neutral indicator must re-render the panel with no stale value or ranks. *(Test in T5.)*
4. **Same-named counties.** Washington County exists in both Oregon and Idaho; search must show the state and select the right FIPS. *(Test in T8.)*
5. **URL state across close and view changes.** Closing the panel in table view keeps `i` and `view`; Back restores the previous view and county. *(Tests in T5, T8.)*

---

### Milestone start (no issue)

- [ ] **Step 1:** Create the branch from up-to-date main: `git fetch origin && git switch -c milestone/m3 origin/main`. The untracked spec and plan come along.
- [ ] **Step 2:** Apply spec §8: update parent spec §3, §4 and §6 for the fallback, `year` and message; rename M3.T3 in the roadmap to "CHR 2023 fallback for Valdez-Cordova"; name Chugach and Copper River in the M3 legacy check of `docs/milestone-review-template.md`.
- [ ] **Step 3:** Commit to `milestone/m3`: `docs: add M3 design and plan`.
- [ ] **Step 4:** Push and open the draft PR `milestone/m3 → main` using `.github/PULL_REQUEST_TEMPLATE/milestone.md`.
- [ ] **Step 5:** Update issues #19–26: replace each "Provisional" body with a link to its task here and its acceptance criteria; retitle #21 to match. Add #62, #80 and #84 to milestone M3. Move them all to `Ready`.

### Task M3.T1: PLACES source and catalog entries (#19)

**Files:**
- Create: `pipeline/src/pnw_health/sources/places.py`, `pipeline/tests/sources/test_places.py`, `pipeline/tests/fixtures/places_2025_sample.json`
- Modify: `config.py`, `indicators.yaml`, `cli.py`, `scripts/record_fixtures.py`, `tests/test_indicators.py`, `tests/test_cli_e2e.py`

**Interfaces:**
- `config.py`: `PLACES_RELEASE = 2025`, `PLACES_DATASET = "swc5-untb"`.
- `places_url() -> str` returns `https://data.cdc.gov/resource/{PLACES_DATASET}.json`.
- `places_cache_path(raw_dir: Path, catalog: list[Indicator], release: int = PLACES_RELEASE) -> Path`: `raw_dir/"places"/f"places_{release}_{digest}.json"`, with the digest built as in `acs_cache_path`.
- `fetch_places(client, raw_dir, catalog, *, release=PLACES_RELEASE, refresh=False) -> Path`.
- `parse_places(path: Path, catalog: list[Indicator]) -> pd.DataFrame` in `LONG_COLUMNS`.

Catalog entries, all `unit: percent`, `source: places`, `moe_field: null`, `ci_level: 0.95`, with descriptions that say "age-adjusted":

| id | label | `source_field` | category | year | direction |
|---|---|---|---|---|---|
| `diabetes` | Diabetes | `DIABETES` | Outcomes | 2023 | worse |
| `coronary_heart_disease` | Coronary heart disease | `CHD` | Outcomes | 2023 | worse |
| `copd` | COPD | `COPD` | Outcomes | 2023 | worse |
| `depression` | Depression | `DEPRESSION` | Outcomes | 2023 | worse |
| `high_blood_pressure` | High blood pressure | `BPHIGH` | Outcomes | 2023 | worse |
| `frequent_mental_distress` | Frequent mental distress | `MHLTH` | Outcomes | 2023 | worse |
| `current_smoking` | Current smoking | `CSMOKING` | Behaviors | 2023 | worse |
| `obesity` | Obesity | `OBESITY` | Behaviors | 2023 | worse |
| `physical_inactivity` | Physical inactivity | `LPA` | Behaviors | 2023 | worse |
| `binge_drinking` | Binge drinking | `BINGE` | Behaviors | 2023 | worse |
| `routine_checkup` | Routine checkup | `CHECKUP` | Access | 2023 | better |
| `dental_visit` | Dental visit | `DENTAL` | Access | 2022 | better |

- [ ] **Step 1: Write failing tests** in `test_places.py`, using a tiny inline JSON body:
  - `test_parse_long_format`: `{"locationid":"53033","measureid":"DIABETES","year":"2023","data_value":"7.2","low_confidence_limit":"6.4","high_confidence_limit":"7.9"}` gives one row with `value == 7.2`, `ci_low == 6.4`, `ci_high == 7.9`, `source == "places"`.
  - `test_absent_keys_are_null`: Socrata omits null fields, so a row with no `data_value` gives NaN and does not raise.
  - `test_year_mismatch_rejected`: a row whose `year` differs from the catalog entry raises `FetchError` matching `"year"`.
  - `test_fetch_query`: with `MockTransport`, the request has `$where` containing `datavaluetypeid='AgeAdjPrv'` and each catalog measure, and an explicit `$limit`.
  - `test_truncated_response_rejected`: patch `places.PLACES_LIMIT = 1`; a one-row body raises `FetchError` matching `"truncated"` and leaves no cache file.
  - `test_bad_bodies_not_cached`: parametrized over HTML, `{}`, `[]`, and rows missing `locationid`.
- [ ] **Step 2:** Run `cd pipeline && uv run pytest tests/sources/test_places.py`. Expected: FAIL (no module).
- [ ] **Step 3:** Implement `places.py`. `$select` is `locationid,measureid,year,data_value,low_confidence_limit,high_confidence_limit`; `$order` is `locationid,measureid`; `PLACES_LIMIT = 100000`. A response with `len(rows) >= PLACES_LIMIT` is truncated. Read optional fields with `.get`.
- [ ] **Step 4:** Add the catalog entries. Add a `places` command to `record_fixtures.py` that saves rows for PNW plus `06037` and `36061`, and record it.
- [ ] **Step 5:** Wire into `cli.py`: fetch, `parse_places` into `harmonize`, and `SourceVintage(source="places", year=PLACES_RELEASE, url=places_url())`. Update `test_cli_e2e.py`: transport serves the fixture for host `data.cdc.gov`, and expected counts become 18. Update `test_indicators.py`: count 18, and restrict the ACS defaults and label checks to `source == "acs"`.
- [ ] **Step 6:** Run the pipeline checks. Expected: all pass.
- [ ] **Step 7:** Commit: `feat(pipeline): add PLACES source and catalog entries`.

### Task M3.T2: CHR source, catalog entries and `years` validation (#20, #62)

**Files:**
- Create: `pipeline/src/pnw_health/sources/chr.py`, `pipeline/tests/sources/test_chr.py`, `pipeline/tests/fixtures/chr_2025_sample.csv`
- Modify: `config.py`, `indicators.py`, `indicators.yaml`, `validate.py`, `cli.py`, `scripts/record_fixtures.py`, `tests/test_validate.py`, `tests/test_contract.py`, `tests/test_indicators.py`, `tests/test_cli_e2e.py`

**Interfaces:**
- `config.py`: `CHR_YEAR = 2025`, `CHR_LEGACY_YEAR = 2023`, `CHR_FILES: dict[int, str] = {2025: "analytic_data2025_v3.csv", 2023: "analytic_data2023_0.csv"}`.
- `chr_url(year: int) -> str` under `https://www.countyhealthrankings.org/sites/default/files/media/document/`.
- `chr_cache_path(raw_dir: Path, year: int) -> Path`: `raw_dir/"chr"/CHR_FILES[year]`.
- `fetch_chr(client, raw_dir, catalog, year: int = CHR_YEAR, *, refresh=False) -> Path`.
- `parse_chr(path: Path, catalog: list[Indicator]) -> pd.DataFrame` in `LONG_COLUMNS`.
- `Indicator.source_scale: SkipJsonSchema[float] = Field(default=1.0, exclude=True)`.

Catalog entries, `source: chr`, `year: 2025`, `moe_field: null`, `source_field` of the form `v147_rawvalue`:

| id | label | code | unit | scale | CI | category | direction |
|---|---|---|---|---|---|---|---|
| `life_expectancy` | Life expectancy | v147 | years | 1 | 0.95 | Outcomes | better |
| `premature_death` | Premature death (years lost) | v001 | rate_per_100k | 1 | 0.95 | Outcomes | worse |
| `low_birth_weight` | Low birth weight | v037 | percent | 100 | 0.95 | Outcomes | worse |
| `injury_deaths` | Injury deaths | v135 | rate_per_100k | 1 | 0.95 | Outcomes | worse |
| `primary_care_physicians` | Primary care physicians | v004 | rate_per_100k | 100000 | null | Access | better |
| `mental_health_providers` | Mental health providers | v062 | rate_per_100k | 100000 | null | Access | better |
| `dentists` | Dentists | v088 | rate_per_100k | 100000 | null | Access | better |
| `preventable_hospital_stays` | Preventable hospital stays | v005 | rate_per_100k | 1 | null | Access | worse |
| `food_insecurity` | Food insecurity | v139 | percent | 100 | null | Social & Economic | worse |
| `severe_housing_cost_burden` | Severe housing cost burden | v154 | percent | 100 | 0.95 | Social & Economic | worse |
| `percent_rural` | Percent rural | v058 | percent | 100 | null | Social & Economic | neutral |

- [ ] **Step 1: Write failing tests** in `test_chr.py`, using an inline CSV with a label row, then a variable-name row, then data:
  - `test_skips_state_and_national_rows`: rows with `countycode == "000"` are absent.
  - `test_blanks_are_null`: a blank `_rawvalue` gives NaN, and a true `0` stays `0.0`.
  - `test_scale_applies_to_value_and_ci`: scale 100 turns `0.25`, `0.2`, `0.3` into `25.0`, `20.0`, `30.0`, compared with `pytest.approx`.
  - `test_missing_ci_columns_are_null`: an indicator whose `_cilow` column is blank or absent gives NaN bounds.
  - `test_missing_required_column_not_cached`: an HTML body, and a CSV without the catalog column, each raise `FetchError` and leave no cache file.
  - In `test_validate.py`, `test_years_out_of_range` parametrized over `-1.0` and `121.0` expects a problem containing `"outside [0, 120]"`; `test_years_in_range` accepts `65.0`.
  - In `test_contract.py`, `test_source_scale_not_exported`: build a `Manifest` with an indicator at `source_scale=100`; `"source_scale"` is absent from `model_dump()` and from `json.dumps(Manifest.model_json_schema())`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement `chr.py` with `pd.read_csv(path, header=1, dtype=str, encoding="latin-1", low_memory=False)`. CI columns are the field with `_rawvalue` replaced by `_cilow` and `_cihigh`. Round scaled values to 6 places, as ACS does. Add `source_scale` to `Indicator` and the `years` check to `validate.py`.
- [ ] **Step 4:** Add the catalog entries. Add a `chr` command to `record_fixtures.py` that keeps the two header rows, the catalog's columns plus `statecode, countycode, fipscode, state, county, year`, and rows for PNW, `06037`, `36061`, `53000` and `00000`. Record it.
- [ ] **Step 5:** Wire into `cli.py` with a `SourceVintage(source="chr", year=CHR_YEAR, url=chr_url(CHR_YEAR))`. Update the e2e transport and expected count to 29, and `test_indicators.py` to 29.
- [ ] **Step 6:** Run the pipeline checks. Expected: all pass, and the committed schema is unchanged.
- [ ] **Step 7:** Commit: `feat(pipeline): add CHR source, catalog entries, and years validation`.

### Task M3.T3: CHR 2023 fallback for Valdez-Cordova (#21)

**Files:**
- Create: `pipeline/tests/fixtures/chr_2023_sample.csv`
- Modify: `sources/chr.py`, `harmonize.py`, `contract.py`, `export.py`, `config.py`, `cli.py`, `schema/*.json`, `scripts/record_fixtures.py`, `tests/sources/test_chr.py`, `tests/test_harmonize.py`, `tests/test_export.py`, `tests/test_cli_e2e.py`, `web/src/test/fixtures/values.ts`, `web/src/test/fixtures/manifest.ts`

**Interfaces:**
- `parse_chr_legacy(path: Path, catalog: list[Indicator]) -> pd.DataFrame`: `LONG_COLUMNS`, only non-null `02261` rows, `year == CHR_LEGACY_YEAR`.
- `LEGACY_COLUMNS` gains `"year"`. `Legacy` gains required `year: int`. `SCHEMA_VERSION = "1.1.0"`.

- [ ] **Step 1: Write failing tests:**
  - `test_legacy_keeps_only_retired_fips`: a CSV with `02261`, `02000` and `53033` returns only `02261` rows, with `year == 2023` and scaling applied.
  - `test_legacy_skips_null_and_absent_fields`: a blank value and a catalog field missing from the file each produce no row, and neither raises.
  - `test_legacy_year_carried` in `test_harmonize.py`: `res.legacy.year.tolist() == [2023, 2023]`.
  - `test_legacy_with_null_successors`: `02261` value plus `02063` and `02066` at NaN attaches to both, and `res.values` still has the two null rows.
  - `test_legacy_exported_with_year` in `test_export.py`: `entry.legacy.year == 2023`, `entry.v is None`, `entry.rank is None`.
  - In `test_cli_e2e.py`, `test_chugach_gets_labeled_legacy`: after a full run, `values.root["life_expectancy"]["02063"]` has `v is None` and `legacy.year == 2023`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement. In `harmonize()` copy `row.year` into each legacy row; in `build_values_file` pass `year=int(lg.year)`. In `cli.py`, fetch `CHR_LEGACY_YEAR`, pass `parse_chr_legacy` to `harmonize`, and add a second `SourceVintage(source="chr", year=CHR_LEGACY_YEAR, ...)`. `fetch_chr` requires catalog columns only when `year == CHR_YEAR`.
- [ ] **Step 4:** Extend `record_fixtures.py chr` to also record `chr_2023_sample.csv` with rows `02261`, `02000` and `53033`. Record it. If the 2025 fixture has a value for life expectancy at 02063 or 02066, stop: the spec's finding no longer holds.
- [ ] **Step 5:** Regenerate schemas. Add `year: 2023` to the web fixture's legacy entry, set the name to `"Valdez-Cordova Census Area (former)"`, and set fixture `schema_version` to `"1.1.0"`.
- [ ] **Step 6:** Run the pipeline and web checks. Expected: all pass.
- [ ] **Step 7:** Commit: `feat(pipeline): attach CHR 2023 values for Valdez-Cordova as labeled legacy`.

### Task M3.T4: Demographics, age 65+, indicator title and bounded picker (#22, #80, #84)

**Files:**
- Modify: `indicators.yaml`, `tests/test_indicators.py`, `tests/test_cli_e2e.py`, `tests/fixtures/acs_profile_*`, `web/src/explorer/Explorer.tsx`, `web/src/explorer/Explorer.test.tsx`, `web/src/styles.css`

Catalog entries, all `unit: percent`, `source: acs`, `year: 2024`, `ci_level: 0.9`, `direction: neutral`, `moe_field` the `PE` code with `PM`:

| id | label | `source_field` | category | label fragment for the test |
|---|---|---|---|---|
| `age_65_plus` | Age 65 and older | `DP05_0024PE` | Social & Economic | `Total population!!65 years and over` |
| `pct_hispanic` | Hispanic or Latino (any race) | `DP05_0090PE` | Demographics | `Hispanic or Latino (of any race)` |
| `pct_white` | White, not Hispanic | `DP05_0096PE` | Demographics | `Not Hispanic or Latino!!White alone` |
| `pct_black` | Black, not Hispanic | `DP05_0097PE` | Demographics | `Not Hispanic or Latino!!Black or African American alone` |
| `pct_aian` | American Indian and Alaska Native, not Hispanic | `DP05_0098PE` | Demographics | `Not Hispanic or Latino!!American Indian and Alaska Native alone` |
| `pct_asian` | Asian, not Hispanic | `DP05_0099PE` | Demographics | `Not Hispanic or Latino!!Asian alone` |
| `pct_nhpi` | Native Hawaiian and Pacific Islander, not Hispanic | `DP05_0100PE` | Demographics | `Not Hispanic or Latino!!Native Hawaiian and Other Pacific Islander alone` |
| `pct_two_or_more` | Two or more races, not Hispanic | `DP05_0102PE` | Demographics | `Not Hispanic or Latino!!Two or More Races` |

- [ ] **Step 1: Write failing tests:** add the fragments above to `EXPECTED_LABEL_FRAGMENTS`, set the catalog count to 37, and add `test_demographics_are_neutral`: every `category == "Demographics"` entry has `direction == "neutral"`. In `Explorer.test.tsx`, `test("indicator title survives filtering")`: type `zzz` in the picker filter, then `expect(screen.getByRole("heading", { name: "Poverty rate" })).toBeInTheDocument()` with `?i=poverty_rate`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Add the entries. Re-record `variables` and `acs` fixtures (needs `CENSUS_API_KEY`). Update the e2e count to 37.
- [ ] **Step 4:** In `Explorer.tsx` render `<h2 className="indicator-title">{indicator.label}</h2>` above the map. In `styles.css` give `.picker` `max-height: calc(100vh - 140px); overflow-y: auto`, with the desktop rule only, so the stacked mobile layout is not trapped in a scroll box.
- [ ] **Step 5:** Run the pipeline and web checks. Expected: all pass.
- [ ] **Step 6:** Commit: `feat: add demographics indicators, indicator title, and bounded picker`.

### Task M3.T5: County panel (#23)

**Files:**
- Create: `web/src/panel/CountyPanel.tsx`, `web/src/panel/CountyPanel.test.tsx`, `web/src/panel/rankSummary.ts`, `web/src/panel/rankSummary.test.ts`
- Modify: `web/src/explorer/Explorer.tsx`, `useExplorerParams.ts`, `useExplorerParams.test.tsx`, `web/src/styles.css`, `web/src/test/fixtures/manifest.ts`

**Interfaces:**
- `useExplorerParams` returns `setCounty: (fips: string | null) => void`; `null` deletes `c`.
- `formatBound(v: number, unit: Unit): string` in `color/formatValue.ts`: the same number formatting as `formatValue` without the `%`, ` years` or ` per 100k` suffix; dollars keep `$`. CI lines use it for both bounds.
- `type County = { fips: string; name: string; state: string }`, exported from `CountyPanel.tsx`.
- `rankSummary(fips: string, entries: Record<string, ValueEntry>, counties: County[]): string | null`. Returns null if the county's `rank` is null. Output form: `"12th of 142 counties, 3rd of 39 in Washington (1 = best)"`, with denominators counting only non-null entries.
- `CountyPanel` props: `{ county: County; indicator: Indicator; entries: Record<string, ValueEntry>; counties: County[]; manifest: Manifest; values: ValuesFile; focusToken: number; onClose: () => void }`. Heading is an `h2` with `tabIndex={-1}`, in `<aside aria-label="County details">`. A change in `focusToken` above 0 focuses it.

- [ ] **Step 1: Write failing tests:**
  - `rankSummary`: denominators exclude nulls; ordinals handle `1st`, `2nd`, `3rd`, `11th`, `12th`, `13th`, `21st`; null rank returns null; state name is spelled out (`WA` → `Washington`).
  - Panel: value and `"90% CI 9.1–9.9"` given `ci_level: 0.9` (change the fixture's `90` to `0.9`); no "CI" text when `lo` is null.
  - Panel null: `"Suppressed or not available"` and a link to `/methodology`.
  - Panel legacy: text `"Reported only for the former Valdez-Cordova Census Area (combined area, CHR 2023): 8.1%"` and a methodology link; no rank text.
  - Panel neutral: no text matching `/of \d+ counties/`.
  - Explorer `test("changing indicator re-renders the panel")`: from `?i=poverty_rate&c=02016` switch to `pct_asian`; the old rank text is gone and the new value shows.
  - Explorer `test("close clears only c")`: from `?i=poverty_rate&c=53033` click Close; `search === "?i=poverty_rate"`. Escape does the same.
- [ ] **Step 2:** Run `cd web && npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Build `counties` in `Explorer` from `paths`. A document-level `keydown` for Escape in the panel ignores events with `defaultPrevented`. Grid: `.explorer--panel` is `280px minmax(0, 1fr) 360px` at `min-width: 1100px`; below that the panel takes `grid-column: 2`, and below 720px the existing single column applies. `main` `max-width` becomes 1440px.
- [ ] **Step 4:** Run the web checks. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(web): add county panel with value, CI, ranks, and legacy message`.

### Task M3.T6: Strip plot (#24)

**Files:**
- Create: `web/src/panel/StripPlot.tsx`, `web/src/panel/buildStripData.ts`, `web/src/panel/buildStripData.test.ts`
- Modify: `CountyPanel.tsx`, `web/src/test/setup.ts`, `web/package.json`, `web/package-lock.json`, `web/e2e/smoke.spec.ts`

**Interfaces:**
- `buildStripData(entries: Record<string, ValueEntry>, selected: string): { points: { fips: string; v: number }[]; nullCount: number; selected: { fips: string; v: number } | null; below: number }`. `below` counts points strictly lower than the selected value.
- `StripPlot` props: `{ county: County; indicator: Indicator; entries: Record<string, ValueEntry> }`.

- [ ] **Step 1:** `cd web && npm install @observablehq/plot@0.6.19`.
- [ ] **Step 2: Write failing tests** for `buildStripData`: nulls excluded and counted; a true `0` kept in `points`; a null selected county gives `selected === null`; `below` is right with ties.
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement. `StripPlot` calls `Plot.plot` in `useEffect` and replaces a container's children: `Plot.dot(points, Plot.dodgeY({ x: "v", r: 3, anchor: "middle" }))` in grey, plus the selected dot in black with a larger radius. Format ticks with `formatValue`. Render `"{N} counties not shown (no data)"` when N > 0, and a visually hidden summary `"{name}: {value}. Higher than {below} of {n} counties with data."`, omitted for a null selection. In `test/setup.ts`, `vi.mock("@observablehq/plot", ...)` so `plot` returns an empty `svg` element, and `dot` and `dodgeY` return `{}`.
- [ ] **Step 5:** Add to `smoke.spec.ts`: after clicking county 53033, `await expect(page.getByRole("complementary", { name: "County details" }).locator("svg circle").first()).toBeVisible()`.
- [ ] **Step 6:** Run the web checks plus `npm run build`. Record bundle size before and after in the PR. Expected: all pass.
- [ ] **Step 7:** Commit: `feat(web): add strip plot to county panel`.

### Task M3.T7: "Who lives here" (#25)

**Files:**
- Create: `web/src/panel/WhoLivesHere.tsx`, `web/src/panel/WhoLivesHere.test.tsx`
- Modify: `CountyPanel.tsx`, `web/src/styles.css`

**Interfaces:** `WhoLivesHere` props: `{ fips: string; indicators: Indicator[]; values: ValuesFile }`. It renders `<section aria-labelledby=...>` with `<h3>Who lives here</h3>`, last in the panel.

Note text, exact: `"Shares do not overlap. People who identify with more than one race are counted under two or more races, so the American Indian and Alaska Native share undercounts them. Some other race is not shown, so shares may not sum to 100%."`

- [ ] **Step 1: Write failing tests:** shows only `category === "Demographics"` indicators; a null value shows `"Not available"` with no bar; a true `0` shows `"0.0%"`; `expect(section.textContent).not.toMatch(/model|expected|flag|life expectancy|better|worse/i)`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement a list of label, `formatValue` and a bar `<span style={{ width: `${v}%` }}>`, separated from the sections above by a border.
- [ ] **Step 4:** Run the web checks. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(web): add Who lives here section`.

### Task M3.T8: Table view, county search, focus (#26)

**Files:**
- Create: `web/src/table/CountyTable.tsx`, `web/src/table/CountyTable.test.tsx`, `web/src/table/sortRows.ts`, `web/src/table/sortRows.test.ts`, `web/src/search/CountySearch.tsx`, `web/src/search/CountySearch.test.tsx`
- Modify: `parseParams.ts`, `parseParams.test.ts`, `useExplorerParams.ts`, `Explorer.tsx`, `Explorer.test.tsx`, `web/src/styles.css`, `web/e2e/smoke.spec.ts`, `web/src/test/fixtures/topology.ts`

**Interfaces:**
- `ExplorerParams.view: "map" | "table"`. `useExplorerParams` adds `setView: (view: "map" | "table") => void`; `map` deletes the param.
- `type SortKey = "name" | "state" | "value" | "rank" | "state_rank"`.
- `sortRows(rows: Row[], key: SortKey, dir: "asc" | "desc"): Row[]`, where `Row = County & { entry: ValueEntry | undefined }`. Nulls last in both directions; ties break by name.
- `CountyTable` props: `{ rows: Row[]; indicator: Indicator; selected: string | null; onSelect: (fips: string, opener: HTMLElement) => void }`. Default sort is `rank asc`, or `value desc` for neutral.
- `CountySearch` props: `{ counties: County[]; onSelect: (fips: string, opener: HTMLElement) => void }`. Shows at most 8 options labeled `"{name}, {state}"`.

- [ ] **Step 1: Write failing tests:**
  - `parseParams`: `view=table` valid; `view=bogus` invalid.
  - `sortRows`: nulls last in asc and desc; true `0` sorts as a number; tie-break by name.
  - Table: `aria-sort` updates on header click; rank columns absent for neutral; a legacy-only row shows `"Former-area value in panel"`; clicking a county name calls `onSelect`.
  - Search: filters by name and by state; add a `Washington` county in both OR and ID to the topology fixture and assert `"Washington, OR"` selects its own FIPS; ArrowDown then Enter selects; Escape closes the list with `defaultPrevented`, leaving the panel open.
  - Explorer: `test("select from search moves focus to panel heading")`; `test("close returns focus to opener")`; `test("close in table view keeps view")` from `?view=table&c=53033` gives `?view=table`; `test("back restores view and county")` using `router.navigate(-1)`.
- [ ] **Step 2:** Run `cd web && npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `CountySearch` follows the ARIA combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`. `Explorer` holds `openerRef` and a `focusToken` counter; closing focuses `openerRef.current` if `isConnected`. Map clicks pass no opener and do not move focus. Add a Map/Table toggle with `aria-pressed` above the main area; the legend renders only in map view.
- [ ] **Step 4:** Extend `smoke.spec.ts`: click `Table`, assert `/[?&]view=table/` and `tbody tr` count 149; fill the county search with `Multnomah`, press ArrowDown and Enter, and assert `/[?&]c=41051/` and that the panel heading is focused.
- [ ] **Step 5:** Run the web checks, `npm run build`, and `npm run test:e2e`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat(web): add table view and county search`.

### Milestone review (no issue)

- [ ] **Step 1:** Run all checks on `milestone/m3` and a real `cd pipeline && uv run pnw-health run --root ..`. Expected: 37 indicators export; `values.json` has `legacy.year == 2023` for `life_expectancy` at 02063 and 02066.
- [ ] **Step 2:** Confirm `build-deploy` is green on `milestone/m3`.
- [ ] **Step 3:** Check by hand on a production build: null and legacy counties for each new source, keyboard-only county selection, and each M3 item in `docs/milestone-review-template.md`.
- [ ] **Step 4:** Fill in the milestone PR: every issue PR, `Closes` lines for #19–26, #62, #80 and #84, verification evidence, and the bundle size change. Mark it ready for the author.
