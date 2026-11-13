# M10 Race-Stratified Outcomes, "Who Lives Here", and v1 Wrap-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The county panel answers "who does this impact here?": the selected outcome broken down by race where CHR reports it, plus a full population profile led by total population. The open M7–M9 follow-ups are closed, so v1 ends with M10.

**Architecture:** A new export file, `strata.json`, holds CHR race-group values for five indicators. It has no ranks and never enters `values.json`, the map or the model. Seven new ACS indicators join `Demographics`. A catalog field `profile` (exported in the manifest) drives the grouped "Who lives here" section. A new `RaceBreakdown` panel component reads `strata.json`.

**Tech Stack:** Python 3.12, pandas, Pydantic, pytest (pipeline); Vite, React, TypeScript, Vitest, Testing Library, Playwright (web).

**Spec:** `docs/superpowers/specs/2026-11-12-m10-race-outcomes-who-lives-here-design.md`. Read it with this plan; section references (§) point there. Tasks 1, 2 and 9–13 implement GitHub issues directly; each issue body is its spec.

## Global Constraints

- `SCHEMA_VERSION = "2.1.0"` (set in Task 3); the web's `SUPPORTED_SCHEMA_MAJOR` stays `2`.
- Race groups, in display order, with exact labels: `aian` "American Indian and Alaska Native", `asian` "Asian", `black` "Black", `hispanic` "Hispanic or Latino", `nhopi` "Native Hawaiian and Pacific Islander", `white` "White", `tom` "Two or more races".
- `race_groups` per indicator: `life_expectancy`, `premature_death`, `injury_deaths` → `[aian, asian, black, hispanic, nhopi, white]`; `low_birth_weight` → all seven; `preventable_hospital_stays` → `[aian, asian, black, hispanic, white]`.
- Race-group values are never ranked, never mapped, never model features, and never written to `values.json`.
- `profile` ∈ `population | age_sex | race | other`. Group headings: "Age and sex", "Race and ethnicity", "Other". The `population` row has no heading and no bar.
- Exact copy: "By race and ethnicity (CHR {year})" / "County overall" / "Not reported: {labels}." / "CHR does not report a group when there are too few cases to give a stable figure." (legacy-area counties, overall entry with `legacy`: "CHR {year} reports no figures for this area.")
- Issue branches are cut from `milestone/m10`. PRs target `milestone/m10`, titles are Conventional Commits, and bodies say `Part of #<n>` (CONTRIBUTING).
- After any contract or catalog change: `cd pipeline && uv run pnw-health schema --root ..`, then commit `schema/`.
- PR `ci` skips Playwright; run it locally with `CI=1` (`cd web && npm run build && CI=1 npx playwright test`).

## Review Focus

1. **A county where CHR reports no group at all** (small Alaska and Idaho counties, Chugach, Copper River). Expected: the breakdown still renders the "County overall" row and lists every group as not reported. Test in Task 6.
2. **A group value with no CI** (all of `preventable_hospital_stays`). Expected: the row shows the value with no interval text and a dot with no bar, and the scale still works. Tests in Tasks 4 and 6.
3. **County overall suppressed but some groups reported.** Expected: the overall row reads "Not available", and the axis is built from the group rows alone. Test in Task 6.
4. **CHR data out of order** (`lo > v`, or a percent above 100 after `source_scale`). Expected: export aborts, and the problem names the indicator, FIPS and group. Test in Task 4.
5. **Changing the Outcome in model mode, or switching modes, with a county open.** Expected: the breakdown follows the new target, sits after the model card, and the panel never shows two breakdowns. Test in Task 6.

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `pipeline/src/pnw_health/contract.py` | `TargetDirection`; `StratumEntry`, `StrataGroup`, `StrataIndicator`, `StrataFile` | 1, 4 |
| `pipeline/src/pnw_health/model/peers.py` | Fail on an all-null feature | 2 |
| `pipeline/src/pnw_health/indicators.py`, `indicators.yaml` | `profile`, `universe`, `race_groups`; 7 new ACS indicators | 3, 4 |
| `pipeline/src/pnw_health/model/run.py` | Reworded `Demographics` exclusion reason | 3 |
| `pipeline/src/pnw_health/config.py` | `SCHEMA_VERSION`, `RACE_GROUP_LABELS` | 3, 4 |
| `pipeline/src/pnw_health/sources/chr.py` | Strata fetch check and `parse_chr_strata` | 4 |
| `pipeline/src/pnw_health/strata.py` (new) | `build_strata_file` | 4 |
| `pipeline/src/pnw_health/validate.py` | `validate_strata` | 4 |
| `pipeline/src/pnw_health/export.py`, `cli.py` | Write the fifth file; harmonize writes `strata.parquet` | 4 |
| `pipeline/scripts/record_fixtures.py` + `tests/fixtures/*` | Race columns and new ACS fields in fixtures | 3, 4 |
| `web/scripts/gen-types.mjs`, `src/types/index.ts`, `src/data/loadData.ts` | Strata types and loading | 5 |
| `web/src/panel/WhoLivesHere.tsx` | Profile-driven layout | 5 |
| `web/src/panel/RaceBreakdown.tsx` + `breakdownScale.ts` (new) | Race breakdown | 6 |
| `web/src/panel/CountyPanel.tsx`, `explorer/Explorer.tsx` | Placement by mode | 6 |
| `web/src/pages/methodology/RaceBreakdownSection.tsx` (new) | Methodology copy | 7 |
| `web/e2e/smoke.spec.ts` | Breakdown and profile steps | 8 |
| `web/src/RouteErrorBoundary.tsx`, `panel/SimilarCounties.tsx`, `panel/ModelCard.tsx`, `README.md`, select styles, M7 items | Cleanups | 9–13 |

---

### Task 1: Rename the target `Direction` to `TargetDirection` (#202)

**Files:** Modify `pipeline/src/pnw_health/contract.py`, `model/flags.py`, the tests that import it, `schema/model.schema.json` (regenerated), and the web import if the generated TS name changes.

**Interfaces:** Produces `contract.TargetDirection = Literal["higher_is_better", "higher_is_worse"]`. `indicators.Direction` is unchanged.

- [ ] **Step 1:** Rename the type and update its imports. `grep -rn "Direction" pipeline/src pipeline/tests` must show no use of `contract.Direction`.
- [ ] **Step 2:** Regenerate the schema. Run `cd pipeline && uv run pytest -q && uv run ruff check && uv run mypy src`, then `cd web && npm run typecheck`. All should PASS.
- [ ] **Step 3:** Commit as `refactor(pipeline): rename the target Direction type to TargetDirection`.

### Task 2: Peers fail loudly on an all-null feature (#197)

**Files:** Modify `pipeline/src/pnw_health/model/peers.py`; test in `pipeline/tests/model/test_peers.py`.

- [ ] **Step 1: Failing test**

```python
def test_find_peers_rejects_feature_null_for_every_eligible_county(...):
    # set one FEATURES column NaN for every PNW county -> pytest.raises(ModelDataError, match=<that feature id>)
```

- [ ] **Step 2:** Run `uv run pytest tests/model/test_peers.py -q`. It should FAIL, with no error raised.
- [ ] **Step 3:** In `find_peers`, before filling with the median, raise `ModelDataError(f"peers: feature {feature} has no values among eligible PNW counties")` for each such feature.
- [ ] **Step 4:** Run the pipeline checks; they should PASS. Commit as `fix(ml): fail when a peer feature has no values`.

### Task 3: "Who lives here" indicators and the `profile` field (new issue)

**Files:**
- Modify: `pipeline/src/pnw_health/indicators.py`, `indicators.yaml`, `config.py`, `model/run.py`, `scripts/record_fixtures.py`
- Modify: `tests/test_indicators.py`, `tests/fixtures/acs_profile_variables_2024.json` and `acs_profile_2024_sample.json` (re-recorded), `schema/manifest.schema.json`
- Docs: parent spec §3 (Demographics paragraph) and §4 (`manifest.json` row)

**Interfaces:**
- Produces: `indicators.Profile = Literal["population", "age_sex", "race", "other"]`; `Indicator.profile: Profile | None = None` and `Indicator.universe: str | None = None`. Both are exported in the manifest.
- Produces: `config.SCHEMA_VERSION = "2.1.0"`.

- [ ] **Step 1: Failing catalog tests** (`tests/test_indicators.py`, against the real catalog)

```python
def test_every_demographics_indicator_has_a_profile(catalog)
def test_one_population_indicator_with_count_unit(catalog):
    pop = [i for i in catalog if i.profile == "population"]
    assert [(i.id, i.unit) for i in pop] == [("total_population", "count")]
def test_profile_groups_in_display_order(catalog):
    by = lambda p: [i.id for i in catalog if i.profile == p]
    assert by("age_sex") == ["age_under_18", "age_65_plus", "pct_female"]
    assert by("other") == ["pct_disability", "pct_veterans", "pct_foreign_born", "pct_limited_english"]
    assert by("race") == [<the 7 existing race-share ids in their current order>]
def test_new_demographics_are_neutral_acs_2024(catalog)   # the 7 new ids: source acs, year 2024, direction neutral, category Demographics
def test_universe_set_where_the_row_would_mislead(catalog):
    u = {i.id: i.universe for i in catalog if i.universe}
    assert u == {"pct_disability": "Civilian noninstitutionalized population",
                 "pct_veterans": "Civilian population 18 and over",
                 "pct_limited_english": "Population 5 and over"}
```

- [ ] **Step 2:** Run `uv run pytest tests/test_indicators.py -q`. It should FAIL.
- [ ] **Step 3: Implement.**
  - Add the two fields to `Indicator`.
  - Add the 7 indicators from spec §4.6, with MOE fields `DP05_0001M`, `DP05_0019PM`, `DP05_0003PM`, `DP02_0072PM`, `DP02_0070PM`, `DP02_0094PM`, `DP02_0115PM`, `ci_level: 0.9`, and a one-sentence `description` that names the universe.
  - Set `profile` on all 15 entries in §4.7. `age_65_plus` keeps `category: Social & Economic`.
  - Order the YAML so each profile group reads in the asserted order.
  - Set `SCHEMA_VERSION = "2.1.0"`.
- [ ] **Step 4: Reword the exclusion reason** in `model/run.py` `EXCLUDED_FEATURE_GROUPS` for `Demographics`, exactly: "Race and ethnicity shares act as proxies for structural factors, so attributions would mislead. The other population measures (size, age, sex, disability, veterans, birthplace and English ability) are shown as context only." Update any test that pins the old string.
- [ ] **Step 5: Re-record the fixtures.** Run `uv run python scripts/record_fixtures.py variables` and `… acs` (needs `CENSUS_API_KEY`). Check that `acs._fields(load_catalog())` stays at or under `MAX_FIELDS = 49`.
- [ ] **Step 6:** Regenerate the schema, then run the pipeline checks; they should PASS. Then run `uv run pnw-health run --stage harmonize && uv run pnw-health run --stage model && uv run pnw-health run --stage export`. Use `jq` to confirm `values.json` has the 7 new ids with no `rank` values and `model.json` differs from the pre-task copy only in `built_at` and the exclusion reason. Use `jq 'walk(if type=="object" then del(.built_at) else . end)'`, then diff and expect one changed string.
- [ ] **Step 7:** Commit as `feat(pipeline): who-lives-here indicators and catalog profile`.

### Task 4: Race strata in the pipeline (#41)

**Files:**
- Create: `pipeline/src/pnw_health/strata.py`, `tests/test_strata.py`
- Modify: `indicators.py`, `indicators.yaml`, `config.py`, `sources/chr.py`, `contract.py`, `validate.py`, `export.py`, `cli.py`, `scripts/record_fixtures.py`
- Modify: `tests/sources/test_chr.py`, `tests/test_validate.py`, `tests/test_export.py`, `tests/test_contract.py`, `tests/test_cli_e2e.py`, `tests/fixtures/chr_2025_sample.csv` (re-recorded)
- Create: `schema/strata.schema.json`
- Docs: parent spec §4 (five files; `strata.json` row) and §10 (remove the race-stratified bullet; point to this spec)

**Interfaces:**
- Produces: `indicators.RaceGroup = Literal["aian", "asian", "black", "hispanic", "nhopi", "white", "tom"]`; `Indicator.race_groups: SkipJsonSchema[tuple[RaceGroup, ...] | None] = Field(default=None, exclude=True)`. A model validator rejects it when `source != "chr"`.
- Produces: `config.RACE_GROUP_LABELS: dict[RaceGroup, str]`, in display order (Global Constraints).
- Produces: `chr.STRATA_COLUMNS = ["fips", "indicator_id", "group", "value", "ci_low", "ci_high", "unreliable"]` and `chr.parse_chr_strata(path: Path, catalog: list[Indicator]) -> pd.DataFrame`. It returns one row per county × indicator × group with a non-null value, and drops state and national rows.
- Produces: `contract.StratumEntry(v: float, lo: float | None, hi: float | None, unreliable: bool = False)`, `StrataGroup(id: RaceGroup, label: str)`, `StrataIndicator(groups: list[RaceGroup], counties: dict[str, dict[str, StratumEntry | None]])`, and `StrataFile(dimension: Literal["race"], source: Literal["chr"], year: int, groups: list[StrataGroup], indicators: dict[str, StrataIndicator])`.
- Produces: `strata.build_strata_file(rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]) -> StrataFile`. Every display FIPS and every listed group is present, with `None` where no row exists.
- Produces: `validate.validate_strata(strata: StrataFile, county_fips: set[str], catalog: list[Indicator]) -> None`, which raises `DataValidationError` with every problem.
- Produces: `export.write_exports(out_dir, manifest, values, topology, model, strata, *, staging)`, which writes `strata.json` fifth.

- [ ] **Step 1: Catalog.** Add `race_groups` to the five entries (Global Constraints) and `RACE_GROUP_LABELS`. Tests: `test_race_groups_only_on_chr` (copy an ACS entry with `race_groups` and expect `ValidationError`), and `test_race_groups_not_in_manifest_schema` (the key is absent from `Indicator.model_json_schema()["properties"]`).
- [ ] **Step 2: Re-record the CHR fixture.** In `record_chr_sample`, for each indicator with `race_groups`, add `{stem}_race_{g}`, `_cilow`, `_cihigh` and `_flag` for each group, keeping only the columns the file has. Run `uv run python scripts/record_fixtures.py chr`.
- [ ] **Step 3: Failing source tests** (`tests/sources/test_chr.py`, using the fixture)

```python
def test_strata_values_cis_and_scale():        # a known 53xxx low_birth_weight white row: value == raw*100, ci_low/high scaled
def test_strata_premature_death_flag_1_is_unreliable():
def test_strata_blank_value_has_no_row():      # suppressed group absent from output
def test_strata_preventable_stays_have_null_cis():   # Review Focus 2
def test_strata_drops_state_and_national_rows():
def test_fetch_check_requires_race_value_columns(tmp_path):  # drop v147_race_white from a copy -> FetchError match "v147_race_white"
```

- [ ] **Step 4: Failing build and validate tests**

```python
# tests/test_strata.py
def test_every_display_fips_and_group_present(rows, county_fips, catalog)
def test_missing_row_is_none():                # Chugach 02063 -> every group None (Review Focus 1, pipeline side)
def test_groups_and_labels_in_display_order()

# tests/test_validate.py
def test_validate_strata_lo_above_v_names_indicator_fips_group():   # Review Focus 4: match "life_expectancy 53077 white"
def test_validate_strata_percent_over_100()
def test_validate_strata_groups_mismatch_catalog()
def test_validate_strata_missing_fips()
def test_validate_strata_indicator_with_no_pnw_value()
```

- [ ] **Step 5:** Run `uv run pytest tests/sources/test_chr.py tests/test_strata.py tests/test_validate.py -q`. It should FAIL on the missing names.
- [ ] **Step 6: Implement.**
  - `fetch_chr` adds the `{stem}_race_{g}` value columns for the current year, and no CI or flag columns, because `v005` has none.
  - `parse_chr_strata` reuses `_numeric` (which tolerates an absent column) and `_unreliable`'s `"1"` rule against `{stem}_race_{g}_flag`.
  - `_harmonize` writes `paths.interim / "strata.parquet"`.
  - `_export` reads it (`_require(..., "harmonize")`), applies `pnw_only`, builds the file, calls `validate_strata`, rounds it with `_rounded`, and passes it to `write_exports`.
  - Update the `write_exports` docstring from four files to five.
- [ ] **Step 7:** Extend `test_export.py` (five files written; a failed fifth write leaves the old set) and `test_cli_e2e.py` (`strata.json` exists and validates as `StrataFile`). Regenerate the schema. The drift test now covers `strata.schema.json`.
- [ ] **Step 8:** Run the pipeline checks; they should PASS. Then do a live run from the raw cache. A `jq` count of non-null groups per indicator over PNW counties must match spec §2's table. `values.json` must be byte-identical to Task 3's output apart from `built_at`.
- [ ] **Step 9:** Update the docs and commit as `feat(pipeline): race-stratified CHR outcomes in strata.json`.

### Task 5: Load strata and the profile-driven "Who lives here" (new issue)

**Files:** Modify `web/scripts/gen-types.mjs`, `src/types/index.ts`, `src/data/loadData.ts` (+ test), `src/test/fixtures/{index,manifest}.ts`, `src/panel/WhoLivesHere.tsx` (+ test), `src/styles.css`. Create `src/test/fixtures/strata.ts`.

**Interfaces:**
- Produces: `type StrataFile, StratumEntry` from `src/types`, and `AppData.strata: StrataFile`.
- Produces: the fixture `strata` covers `life_expectancy` and `preventable_hospital_stays` for the fixture counties, including one county with every group `null` and one `unreliable` entry.

- [ ] **Step 1: Failing tests**

```ts
// loadData.test.ts
it("returns strata with the other files")
it("rejects a strata.json without indicators", /strata\.json/)   // message: "The race breakdown data (strata.json) is incomplete or malformed. Reload the page to try again."
// WhoLivesHere.test.tsx
it("shows Population first as a number without a bar")
it("groups rows under Age and sex, Race and ethnicity, Other, in catalog order")
it("shows the universe under rows that have one")    // "Civilian population 18 and over"
it("omits a group with no indicators")
it("includes age_65_plus though its category is Social & Economic")
```

- [ ] **Step 2:** Run `npm test`. It should FAIL.
- [ ] **Step 3: Implement.**
  - `gen-types` adds `"strata"`.
  - `loadData` fetches `strata.json` in the same `Promise.all`, with an `isStrataFile` guard (`indicators` is an object and `groups` is an array).
  - `WhoLivesHere` filters `indicators` by `profile` and renders a group order of `["population", "age_sex", "race", "other"]`.
  - Group headings are `h4`. Population uses `formatValue(v, "count")` with no track.
  - `universe` renders as a muted line under the label.
  - The existing race note stays under the race group.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`; they should PASS. Check the panel in a browser at desktop width and at 375px (dev server against Task 4's export).
- [ ] **Step 5:** Commit as `feat(web): load strata and group who-lives-here by profile`.

### Task 6: Race breakdown in the county panel (new issue)

**Files:** Create `web/src/panel/RaceBreakdown.tsx` (+ test) and `breakdownScale.ts` (+ test). Modify `CountyPanel.tsx` (+ test), `explorer/Explorer.tsx`, `styles.css`.

**Interfaces:**
- Consumes: `AppData.strata` (Task 5).
- Produces: `breakdownScale(values: number[]): (x: number) => number`, which maps to 0–100 (%). The domain is min to max of `values`, padded by 5% of the span on each side. A single distinct value maps to 50.
- Produces: `RaceBreakdown({ indicator, fips, overall, strata }: { indicator: Indicator; fips: string; overall: ValueEntry | undefined; strata: StrataFile })`. It returns `null` when `strata.indicators[indicator.id]` is absent.
- Produces: `CountyPanel` gains the props `strata: StrataFile` and `targetIndicator: Indicator`. `Explorer` passes the manifest indicator whose id is `params.target`.

- [ ] **Step 1: Failing tests**

```ts
// breakdownScale.test.ts
it("pads the domain by 5% each side"); it("maps a single value to 50")
// RaceBreakdown.test.tsx
it("renders heading 'By race and ethnicity (CHR 2025)' and a County overall row first")
it("lists only reported groups, in strata group order, with value and CI")
it("names unreported groups in one 'Not reported: …' line plus the explanation")
it("all groups null: overall row, every group listed as not reported")        // Review Focus 1
it("group without CI shows value only, no interval text")                       // Review Focus 2
it("overall suppressed: overall row reads 'Not available'; marks scale from groups") // Review Focus 3
it("unreliable group carries the unreliable marker")
it("renders nothing for an indicator without strata")
// CountyPanel.test.tsx
it("explore mode: breakdown for the selected indicator, under its value")
it("model mode: breakdown for the target, right after the model card, and none in the indicator section") // Review Focus 5
it("model mode with a different target re-renders for that target")
```

- [ ] **Step 2:** Run `npm test`. It should FAIL.
- [ ] **Step 3: Implement.**
  - Each row's CI uses the same format as the panel's existing CI line (`formatBound` and `ci_level`).
  - Unreliable rows end with " (unreliable)". When any row is unreliable, add the note "CHR marks some figures as unreliable; read them with caution." with the existing `/methodology#unreliable` link.
  - Dot-and-interval marks are `aria-hidden`; the text is the accessible content.
  - No better or worse colors.
  - Wrap the component in `<section aria-labelledby>` with an `h3`.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`; they should PASS. Check in a browser at desktop width, 375px, and dark mode, in both modes.
- [ ] **Step 5:** Commit as `feat(web): race breakdown in the county panel`.

### Task 7: Methodology and docs (new issue)

**Files:** Create `web/src/pages/methodology/RaceBreakdownSection.tsx` (+ test). Modify `pages/Methodology.tsx`, `README.md`, and `pages/About.tsx` if it lists indicators.

- [ ] **Step 1:** Read CHR's 2025 technical documentation on race/ethnicity definitions (whether the non-Hispanic groups exclude Hispanic people) and on pooled years for the race measures. Note what it says, with the URL, in the PR body.
- [ ] **Step 2: Failing test.** The section has `id="race-breakdown"` and heading "Outcomes by race and ethnicity". It names the five measures and the source year from `strata.year`, and says the breakdown is not mapped or ranked. It also lists the "Who lives here" measures with their universes, taken from the manifest's `universe` fields.
- [ ] **Step 3:** Write the section from spec §5.4, using Step 1's findings for the definitions and years. Place it after `MissingDataSection`. Pass it `strata` and `manifest.indicators`.
- [ ] **Step 4:** Update the README: the Demographics and race-breakdown lines, and the data-files list now has five files. Run the web checks; they should PASS. Commit as `docs(web): methodology for race breakdowns and who lives here`.

### Task 8: Smoke tests (new issue)

**Files:** Modify `web/e2e/smoke.spec.ts`.

```ts
test("race breakdown follows the indicator and the outcome", async ({ page }) => {
  // goto "./?c=53077&i=life_expectancy": region "By race and ethnicity" has "County overall"
  // goto "./?c=53077&i=diabetes": that region is absent
  // goto "./?mode=model&c=53077&t=premature_death": exactly one such region, containing "Premature death"
});
test("who lives here shows population and groups", async ({ page }) => {
  // goto "./?c=53077": section "Who lives here" shows "Population", "Age and sex", "Other"
});
```

- [ ] **Step 1:** Add both tests. Run them: `npm run build && CI=1 npx playwright test` should PASS for the smoke, a11y, mobile and pages404 projects.
- [ ] **Step 2:** Commit as `test(web): smoke steps for race breakdown and who lives here`.

### Task 9: Error boundary focuses its heading (#203)

- [ ] Write the failing test in `RouteErrorBoundary.test.tsx`: after a child throws, `document.activeElement` is the fallback's `[data-page-heading]`. Then implement it in `componentDidUpdate` when the state switches to failed. Commit as `fix(web): focus the error fallback heading`.

### Task 10: Similar counties sentence from the method's features (#204)

- [ ] Build the named factors from `peers.method.features`, using catalog labels (first three, then "and N other social and economic measures"). With fewer than three features, name them all with no count. Update the test that pins the under-three case. Commit as `fix(web): similar-counties sentence names the real factors`.

### Task 11: README and model-card wording (#205)

- [ ] Apply the two rewordings exactly as in the issue, and update `ModelCard.test.tsx`. Commit as `docs: smoother outcome sentences`.

### Task 12: Style the Outcome and methodology selects (#206)

- [ ] Give both selects the app's form-control styles (font, size, padding, border), a 44px minimum height at phone width, and a visible focus ring. Check in a browser at desktop width and at 375px, in light and dark. Commit as `style(web): match selects to the form controls`.

### Task 13: M7 web suggestions (#157)

- [ ] Work through each bullet in the issue. Each one gets done, with a test where behaviour changes (`formatSigned` non-finite, `pages-server` 400, skip link, `pages404` body), or gets closed in the PR body with a reason. Run the web checks and `CI=1` Playwright. Commit as `chore(web): M7 review suggestions`.

---

## Work order

Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, then 9–13 in any order. Task 3 sets the schema version that Task 4 relies on. Tasks 5 and 6 need Task 4's export to check in a browser. Task 10 and Task 6 both touch the panel, so run them one after the other, not in parallel.

## Issue reconciliation (before any issue moves to Ready)

- #41 becomes Task 4. New issues: Task 3 "Who lives here indicators and catalog profile", Task 5 "Load strata and group Who lives here by profile", Task 6 "Race breakdown in the county panel", Task 7 "Methodology for race breakdowns and who lives here", Task 8 "Smoke tests for race breakdown and who lives here". All go in milestone M10, and each body links its plan section.
- Roadmap M10 section: rename it "Equity + v1 wrap-up", list T1–T13 with issue numbers, note that #42 moved to Backlog (`future`), and say that M10 is the last v1 milestone.

## Milestone wrap-up (after all tasks)

Run every check on `milestone/m10`: both pipeline and web suites, plus `CI=1` Playwright. Fill in the milestone PR with every issue PR, a `Closes #…` line per issue, and verification evidence, including Task 3 Step 6 and Task 4 Step 8. Mark it ready for the author, and watch `build-deploy` on the milestone push.
