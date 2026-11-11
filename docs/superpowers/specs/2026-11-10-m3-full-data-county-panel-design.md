# M3 Full Data + County Panel — Design

**Date:** 2026-11-10
**Status:** Design approved in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§3 Data, §4 Contract, §6 Website, §7 Testing). This document records the decisions M3 adds; where it is silent, the parent spec applies.

## 1. Outcome

The site offers 37 indicators from ACS, CDC PLACES and County Health Rankings (CHR). Selecting a county opens a panel with its value, CI, ranks, strip plot, any legacy note and "Who lives here." A table view and county search give keyboard and screen-reader users a path to every county.

**Exit criteria:**
- All 37 catalog indicators are live on a real pipeline run, and `build-deploy` is green on `milestone/m3`.
- The panel shows value, CI, ranks, strip plot, legacy notes and "Who lives here."
- Suppressed and missing values from each new source show as "not available," never as zero.
- The Valdez-Cordova message appears on Chugach and Copper River for measures that CHR 2025 leaves blank and CHR 2023 reports.
- Every county can be reached and selected by keyboard alone.

**Deferred:**

| Feature | Arrives in | M3 behavior |
|---|---|---|
| Model mode and model card | M4, M5 | `mode=model` stays a bad param; the panel has no model section |
| Mobile bottom sheet | M6.T4 | The panel stacks under the map below 1100px |
| Methodology content | M6 | Panel links point at the stub page |

## 2. Findings from the real data

Checked against the live sources while designing M3:

- **PLACES 2025 release** (Socrata dataset `swc5-untb`) uses 2020-vintage Alaska FIPS and covers all 149 counties. It has no 02261 row. Most measures are 2023 and some are 2022. Its social-needs measures cover only 74 of the 149 counties.
- **CHR 2024 and 2025** have no 02261 row. Chugach (02063) and Copper River (02066) are present, but several measures are blank for them, including life expectancy and premature death.
- **CHR 2023 and earlier** report 02261 (life expectancy 78.0 in 2023) and have no successor rows.
- **ACS 2024** reports the successors and has no 02261 row.
- **CHR formats:** percent measures are stored as fractions (0.25), and provider rates are stored per person (0.00097). The first two rows of the CSV are labels and variable names. No full 2026 file is listed on the CHR documentation page, so 2025 v3 is the current vintage.

As a result, no current source triggers the parent spec's legacy path. §4 adds a fallback so that it runs on real data.

## 3. Indicator catalog

| Source | Category | Indicators (`source_field`) |
|---|---|---|
| ACS, existing (6) | Social & Economic, Access | Unchanged from M1 |
| ACS, new (1) | Social & Economic | Age 65 and older (`DP05_0024PE`), `neutral` |
| ACS, new (7) | Demographics, all `neutral` | Hispanic, any race (`DP05_0090PE`); not Hispanic, alone: White (`0096`), Black (`0097`), AI/AN (`0098`), Asian (`0099`), NHPI (`0100`); not Hispanic, two or more races (`0102`) |
| PLACES (6) | Outcomes | `DIABETES`, `CHD`, `COPD`, `DEPRESSION`, `BPHIGH`, `MHLTH` |
| PLACES (4) | Behaviors | `CSMOKING`, `OBESITY`, `LPA`, `BINGE` |
| PLACES (2) | Access | `CHECKUP`, `DENTAL` |
| CHR (4) | Outcomes | Life expectancy (`v147`), premature death (`v001`), low birth weight (`v037`), injury deaths (`v135`) |
| CHR (4) | Access | Primary care physicians (`v004`), mental health providers (`v062`), dentists (`v088`), preventable hospital stays (`v005`) |
| CHR (3) | Social & Economic | Food insecurity (`v139`), severe housing cost burden (`v154`), percent rural (`v058`, `neutral`) |

ACS field codes are pinned by label assertions in `tests/test_indicators.py`, as in M1. Two DP05 codes carry the 65-and-over label; the plan picks the one in the total-population age block.

**PLACES uses age-adjusted prevalence (`AgeAdjPrv`).** Crude rates mostly show which counties are older: Madison, ID ranks 1st for diabetes on crude rates and 117th age-adjusted. Life expectancy is also unaffected by age mix, which keeps M4's behaviors comparison consistent. Descriptions say "age-adjusted."

**Left out for coverage** (counties with values, of 149): infant mortality 49, drug overdose 82, child mortality 85, firearm fatalities 110, motor vehicle crash deaths 115, suicides 118, PLACES social needs 74. Every included CHR indicator has at least 131.

**Demographics definition:** the shares do not overlap, so they read as a breakdown. "Alone" undercounts people who identify as AI/AN plus another race, which matters in Alaska, and "Who lives here" says so. "Some other race alone" is not shown, so shares may not sum to 100.

Age 65 and older and percent rural sit outside Demographics because M4 uses them as features, and Demographics are never model features.

## 4. Pipeline

- **`sources/places.py`:** one national Socrata query for the catalog's measures at `AgeAdjPrv`, with an explicit `$limit`. A response with exactly `$limit` rows is an error, because it may be truncated. The cache file is keyed by release and measure list, as ACS is. CIs are 95%.
- **`sources/chr.py`:** parses the 2025 v3 CSV, skips state and national rows, and turns blanks into nulls. CIs are 95%, where CHR provides them. Where a measure has a `_flag` column, flag 1 ("Unreliable") sets `unreliable` on the value; flag 2 ("Suppressed") rows are already blank.
- **`source_scale`:** a new optional catalog field, default 1, used only by parsers and excluded from the exported manifest and schema. Value and CI bounds are multiplied by it: 100 for fractions, 100000 for per-person provider rates.
- **Config:** `PLACES_RELEASE = 2025`, `CHR_YEAR = 2025`, `CHR_LEGACY_YEAR = 2023`, so the `build-deploy` raw cache changes when a vintage does.
- **Validation:** `years` values must be within [0, 120] (closes #62). Legacy values pass the same range checks as current values.
- **Manifest sources** list PLACES, CHR 2025 and CHR 2023 alongside ACS and boundaries.

### Valdez-Cordova fallback

The pipeline also reads CHR 2023, keeping only non-null 02261 rows for catalog CHR indicators, with `year` 2023, and passes them to `harmonize()` with the other frames. A catalog field missing from the 2023 file yields no row. The existing split logic does the rest: a row attaches as `legacy` only where neither successor has a value, and retired-FIPS rows are removed from the values. Legacy values stay out of ranks, color bins and the model.

### Contract

`Legacy` gains a required `year: int`, and `legacy.parquet` gains a matching column. `schema_version` becomes `1.1.0`; the site accepts major version 1, so this is compatible. `ValueEntry` then gains an optional `unreliable` boolean, present only when true, and `schema_version` becomes `1.2.0`.

## 5. Web app

### Layout
The county panel is an in-flow third grid column, about 360px wide, present only when a county is selected. An overlay would cover Idaho and eastern Oregon and get in the way of clicking between counties. `main` grows from 1280px to 1440px. Below 1100px the panel stacks under the map. The selected indicator's label is always shown above the map (#80), followed by its description and a source line, and the picker scrolls within a bounded height (#84). The source line gives the data year for ACS and PLACES and says "{year} release" for CHR.

### URL state
`view` accepts `map` and `table`; `mode` is unchanged. `setCounty` accepts `null`, which removes `c`. A view change pushes a history entry and keeps `i` and `c`.

### County panel
In order:
1. **Header:** county name, state and a close button. Close and Escape both clear `c`.
2. **Value and CI:** for example "95% CI 74.2–76.1," using the indicator's `ci_level`. The CI line is omitted if the source has none.
3. **Ranks:** counted against counties with data, for example "12th of 142 counties, 3rd of 39 in Washington (1 = best)." Neutral indicators show no ranks.
4. **Reliability:** if the source marks the value unreliable, a caution with a methodology link. The value and ranks stay visible.
5. **Missing data:** if `v` is null and `legacy` exists, "Reported only for the former Valdez-Cordova Census Area (combined area, CHR {year}): {v}" with a methodology link. If `v` is null with no `legacy`, "Suppressed or not available" with a methodology link.
6. **Strip plot:** see below.
7. **"Who lives here":** the seven Demographics shares as a list with small bars, under its own heading, with the "alone" note. Its wording never refers to health results or to model output, and M5's model card will sit above it as a separate section.

### Strip plot
Observable Plot draws one dot per county with a non-null value and highlights the selected county. A pure function `buildStripData(entries, selected)` returns the points and the null count, so its logic is tested without rendering Plot in jsdom. The plot is followed by "N counties not shown (no data)" where N is above zero. A text summary gives screen readers the county's position. Dots are not interactive. A selected county with a null value has no highlighted dot.

### Table view
A Map/Table toggle sits above the main area. Columns are county, state, value, CI, rank and state rank; rank columns are hidden for neutral indicators. Headers are sort buttons with `aria-sort`. Nulls sort last in both directions. County names are buttons that select the county. Rows with only a legacy value are marked, and unreliable values say "(unreliable)."

### County search
An accessible combobox above the map or table matches county name and state and works by keyboard alone. County-name matches are listed before state-name matches. After a selection from search or the table, focus moves to the panel heading. Closing the panel returns focus to the element that opened it.

### New dependency
`@observablehq/plot` (0.6.x), chosen in the parent spec. It brings in all of d3, so the milestone PR reports the change in bundle size.

## 6. Task order

Issue IDs stay as they are; #62, #80 and #84 fold into tasks:

| Task | Scope |
|---|---|
| M3.T1 (#19) | PLACES source and catalog entries |
| M3.T2 (#20) | CHR source, catalog entries, `source_scale`, `years` validation (#62) |
| M3.T3 (#21) | CHR 2023 fallback, `Legacy.year`, schema 1.1.0 |
| M3.T4 (#22) | Demographics and age 65+ catalog entries; indicator title (#80); bounded picker (#84) |
| M3.T5 (#23) | County panel: layout, value, CI, ranks, missing and legacy messages |
| M3.T6 (#24) | Strip plot |
| M3.T7 (#25) | "Who lives here" |
| M3.T8 (#26) | Table view, county search, focus handling, Playwright additions |

## 7. Testing

**Pipeline**, offline against recorded fixtures:
- PLACES: parsing, measure-type filter, truncation error.
- CHR: two-row header, skipped state and national rows, blanks as nulls, scaling of values and CIs.
- Fallback: attaches when both successors are null; does not attach when a successor has a value; legacy excluded from ranks; `year` exported.
- Validation: a failing-input test for `years`.

**Web**, against committed fixtures:
- `parseParams` with `view=table`; closing the panel removes only `c`.
- Panel states: value, no CI, null, legacy, neutral; rank denominators count only non-null counties.
- `buildStripData`: null exclusion and count, true zero kept, selected county null.
- Table: sorting, nulls last in both directions, neutral columns hidden, `aria-sort`.
- Search: filtering, keyboard selection, focus move and return.

**Playwright** adds: click a county → panel appears → switch to table → select a county through search.

## 8. Documentation changes in M3

- Parent spec §3: the legacy rule notes the CHR 2023 fallback and vintage label. §4: `legacy` includes `year`.
- Parent spec §6: the legacy message includes the vintage.
- Roadmap: M3.T3 renamed "CHR 2023 fallback for Valdez-Cordova."
- `docs/milestone-review-template.md`: the M3 legacy check names Chugach and Copper River.
