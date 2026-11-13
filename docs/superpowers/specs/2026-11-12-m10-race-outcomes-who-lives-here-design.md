# M10 Race-Stratified Outcomes and "Who Lives Here" — Design (#41)

**Date:** 2026-11-12
**Status:** Approved
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§3 Data sources, §4 Export contract, §6 Website, §10 Future work). This document records only what #41 decides; where it is silent, the parent spec and the M3–M9 specs apply. #42 (state health-department indicators) gets its own spec.

## 1. Intent

The county panel answers **"who does this impact here?"** for the selected county, in two parts:

1. **How the outcome differs by race and ethnicity**, where County Health Rankings (CHR) publishes it. This is the only direct "this group fares worse here" answer the data supports at county level.
2. **Who lives here**: the county's population makeup (size, age, sex, race and ethnicity, disability, veterans, birthplace, English ability), from Census ACS, which covers every county.

The author chose the "who lives here" framing for every factor other than race. Outcomes broken down by age, sex, disability and so on are not available for health outcomes at county level, and are not part of this work.

M10 is the last milestone of v1.

### Goals
- In the county panel, show the selected outcome by race wherever CHR has a value, with its confidence interval, and say plainly which groups CHR does not report.
- Expand "Who lives here" from 7 race shares to a full population profile, led by total population.
- Keep the race breakdown honest about how little of it there is: most PNW counties have values for two or three groups at most.

### Non-goals
- Outcomes by age, sex, disability, income or any factor other than race.
- Race breakdowns for PLACES or ACS indicators.
- Region-wide comparisons by race (for example "AI/AN life expectancy across the PNW").
- Any change to the model: features, targets, metrics and flags stay as they are.

### Anti-goals (failure even if it works)
- **Mapping or ranking race-group values.** With 11–45 PNW counties per group outside White and Hispanic, a map would be mostly hatched, and ranks among the few counties that report would mislead.
- **A blank row read as zero or as "no disparity".** A group with no value must be named and explained, not silently dropped.
- **Breaking existing consumers.** `values.json`, the map, the table and the model must not change because of the breakdown.

## 2. Data reality (CHR 2025, 149 PNW counties)

CHR splits five of the indicators we already show by race:

| Indicator (catalog id) | CHR field stem | AI/AN | Asian | Black | Hispanic | NHPI | White | Two or more |
|---|---|---|---|---|---|---|---|---|
| Life expectancy (`life_expectancy`) | `v147` | 44 | 33 | 21 | 83 | 11 | 128 | — |
| Premature death (`premature_death`) | `v001` | 61 | 21 | 25 | 69 | 11 | 131 | — |
| Low birth weight (`low_birth_weight`) | `v037` | 40 | 34 | 23 | 84 | 14 | 124 | 51 |
| Injury deaths (`injury_deaths`) | `v135` | 47 | 16 | 20 | 62 | 7 | 126 | — |
| Preventable hospital stays (`preventable_hospital_stays`) | `v005` | 43 | 18 | 22 | 46 | — | 125 | — |

Counts are PNW counties with a value. "—" means CHR publishes no column for that group and measure. NHPI has one Idaho value: Ada County (16001), low birth weight.

Column shape: `{stem}_race_{group}` with `_cilow` / `_cihigh` beside it, group ∈ `aian, asian, black, hispanic, nhopi, white, tom`. Only `v001` also has `{stem}_race_{group}_flag` (`1` = unreliable, `2` = suppressed, blank = no flag). For the other four, a blank value can't be told apart from "not computed"; the UI treats both as "not reported" (§5.2).

`v005` race columns have no CI columns in the 2025 file (the builder confirms this against the CSV; if they exist, carry them).

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | A fifth export file, `strata.json`, holding only the race breakdown | One more file and schema. Existing files and consumers are untouched, and "never mapped, never ranked" is enforced by where the data lives. |
| B | An optional `by_race` block on each `values.json` entry | No new file, but changes the shape every part of the site reads, and mixes ranked and never-ranked values in one record. |
| C | Each group as its own catalog indicator (`life_expectancy_aian`, …) | Map, ranks and picker would work for free, which is exactly what §1 rules out. About 30 new picker entries, and the per-state coverage check fails (NHPI has almost no Idaho values). |

The author picked A.

## 4. Pipeline and contract

### 4.1 Catalog

The catalog marks which indicators have a race breakdown, so the pipeline doesn't hard-code CHR stems:

```yaml
- id: life_expectancy
  ...
  race_groups: [aian, asian, black, hispanic, nhopi, white]
```

`race_groups` is optional (default absent = no breakdown), allowed only on `source: chr` entries, and lists exactly the groups CHR publishes for that measure (§2 table). It is pipeline-only: excluded from the manifest's indicator JSON the same way `source_scale` is, so `manifest.schema.json` does not change because of it. (Builder's call whether it's `SkipJsonSchema` + `exclude=True` like `source_scale`, or a separate map in `config.py`; the catalog field is preferred so a measure's breakdown lives next to its definition.)

### 4.2 CHR source

`sources/chr.py` gains a parse step for strata, beside the existing long-format parse:

- For each catalog indicator with `race_groups`, read `{stem}_race_{g}`, `_cilow`, `_cihigh` and (if present) `_flag` for every listed group. `stem` is `source_field` without `_rawvalue`.
- Apply the indicator's `source_scale` to `v`, `lo` and `hi` (low birth weight is a proportion in CHR, a percent in the catalog).
- `fetch_chr`'s column check adds these columns for the current `CHR_YEAR` file, so a renamed column fails at fetch with the existing "re-download" message.
- Only the current `CHR_YEAR` file is used. No legacy values: Chugach (02063) and Copper River (02066) get all-null strata, and Valdez-Cordova (02261) is not a display county.
- National rows are read but only the 149 PNW display counties are exported. Strata never enter `long`, ranks or the model.

### 4.3 `strata.json`

New Pydantic models in `contract.py`; JSON Schema written to `schema/strata.schema.json` and covered by the existing drift test.

```jsonc
{
  "dimension": "race",
  "source": "chr",
  "year": 2025,
  "groups": [                                   // display order
    {"id": "aian",     "label": "American Indian and Alaska Native"},
    {"id": "asian",    "label": "Asian"},
    {"id": "black",    "label": "Black"},
    {"id": "hispanic", "label": "Hispanic or Latino"},
    {"id": "nhopi",    "label": "Native Hawaiian and Pacific Islander"},
    {"id": "white",    "label": "White"},
    {"id": "tom",      "label": "Two or more races"}
  ],
  "indicators": {
    "life_expectancy": {
      "groups": ["aian", "asian", "black", "hispanic", "nhopi", "white"],
      "counties": {
        "53077": {
          "aian":     {"v": 66.1, "lo": 64.0, "hi": 68.2, "unreliable": false},
          "asian":    null,
          ...
        },
        ...
      }
    }
  }
}
```

- `counties` has all 149 display FIPS for every indicator. Every listed group is present for every county: an entry, or `null` when CHR reports no value (suppressed or not computed).
- `unreliable` is `true` only where CHR's flag says `1` (premature death only); omitted or `false` otherwise, matching `ValueEntry`.
- No `rank` or `state_rank` fields exist in the model.
- Group labels and the non-Hispanic note (§5.2) follow CHR's definitions; the builder checks CHR's 2025 technical documentation for whether the non-Hispanic groups exclude Hispanic people and words the methodology to match.
- Values go through the same rounding as `values.json` (`_rounded`).

`SCHEMA_VERSION` goes from `2.0.0` to `2.1.0`: the change is additive (a new file, no change to existing ones). The web's supported major stays 2.

### 4.4 Export

`write_exports` writes `strata.json` with the other four files, in the same temporary directory and atomic move, so the five files are always a set.

### 4.5 Validation

New checks in `validate.py`, run before export with the others (any failure aborts):

- Every indicator in `strata.json` is a catalog indicator with `race_groups`, and vice versa; its `groups` equals the catalog's `race_groups`.
- Exactly the 149 display FIPS per indicator; every listed group present per county.
- Each non-null entry: `lo ≤ v ≤ hi` where all three are present; percent units within [0, 100]; counts and rates non-negative.
- Every strata indicator has at least one non-null value in the PNW (catches a silent column rename that slipped past the fetch check).

No per-state coverage rule: partial coverage is the nature of this data.

### 4.6 New "Who lives here" indicators

Added to `indicators.yaml`, all `source: acs`, `year: 2024`, `category: Demographics`, `direction: neutral`, with MOE fields and `ci_level: 0.9` like the existing ACS entries. Variable labels below were checked against the Census API's 2024 ACS 5-year profile variables.

| id | Label | Field | Unit | Universe (goes in `description`) |
|---|---|---|---|---|
| `total_population` | Total population | `DP05_0001E` (MOE `DP05_0001M`) | count | All residents |
| `age_under_18` | Under 18 | `DP05_0019PE` | percent | Total population |
| `pct_female` | Female | `DP05_0003PE` | percent | Total population |
| `pct_disability` | With a disability | `DP02_0072PE` | percent | Civilian noninstitutionalized population |
| `pct_veterans` | Veterans | `DP02_0070PE` | percent | Civilian population 18 and over |
| `pct_foreign_born` | Born outside the US | `DP02_0094PE` | percent | Total population |
| `pct_limited_english` | Speaks English less than "very well" | `DP02_0115PE` | percent | Population 5 and over |

Because they are `Demographics`, the model already excludes them (`model/run.py`), they get no ranks, and they appear in the picker under Demographics and can be mapped with the neutral scale, like the existing race shares.

`age_65_plus` stays in `Social & Economic`: it is a model feature, and moving it to `Demographics` would drop it from the model. "Who lives here" shows it anyway (§4.7).

**Exclusion reason (my call).** `EXCLUDED_FEATURE_GROUPS` in `model/run.py` gives one reason for the whole `Demographics` category, and today it talks only about race shares. It is reworded to cover the whole category: race shares act as proxies for structural factors, and the rest are descriptive context kept out so the feature set stays as M4–M9 defined it. This changes one string in `model.json` (the model card's exclusion reason) and the Methodology exclusions section. No retraining: features, metrics, flags and SHAP are unchanged.

### 4.7 "Who lives here" layout in the catalog (my call)

The layout of the panel section lives in the catalog, not in web code, so a renamed or removed indicator can't silently drop out of it. `web/public/data` is not committed, so a web test against a built manifest would not run everywhere.

- New optional catalog field `profile`: one of `population`, `age_sex`, `race`, `other`. Order within a group is catalog order.
- Unlike `race_groups`, `profile` **is** exported in the manifest's indicator entries (`manifest.schema.json` gains an optional field; additive, covered by the 2.1.0 bump).
- Assignments: `total_population` → `population`; `age_under_18`, `age_65_plus`, `pct_female` → `age_sex`; the 7 race shares → `race`; `pct_disability`, `pct_veterans`, `pct_foreign_born`, `pct_limited_english` → `other`. Catalog order is arranged so each group reads in the order shown in §5.1.
- A catalog test checks that every `Demographics` indicator has a `profile`, and that `population` holds exactly one `count` indicator.

## 5. Website

### 5.1 "Who lives here"

`WhoLivesHere.tsx` today renders every `Demographics` indicator as a percent bar. It changes to render the manifest indicators that have a `profile` (§4.7), grouped and ordered by it (numbers below are illustrative):

```
Who lives here
  Population            256,728
  Age and sex
    Under 18            28%  ▇▇▇
    65 and older        14%  ▇▇
    Female              50%  ▇▇▇▇▇
  Race and ethnicity
    (the 7 existing shares, in their current order)
    note: the existing "shares do not overlap…" note
  Other
    With a disability   15%  ▇▇
    Veterans             8%  ▇
    Born outside the US 20%  ▇▇
    Speaks English less than "very well"  12%  ▇▇
```

- Total population is a plain number (formatted count), no bar.
- A group with no indicators is not rendered.
- Group sub-headings use the panel's existing heading levels (`h3` section, `h4` groups) and the same row, bar and "Not available" styling as today.
- Each percent row's universe (for example "civilian population 18 and over") is shown where the row's meaning would otherwise mislead: veterans, disability and limited English. Builder's call whether that's a small suffix, a tooltip-free footnote, or a line in the section note; it must be visible without hovering.

### 5.2 Race breakdown

A new component (for example `panel/RaceBreakdown.tsx`) that takes the indicator id to break down. It appears only when `strata.json` has that indicator. Where it goes (my call):

- **Explore mode:** in the indicator section, directly under the selected indicator's value, for that indicator.
- **Model mode:** directly after the model card, for the selected target (`params.target`). The indicator section further down keeps showing the Explore indicator, as it does today, and gets no breakdown in model mode, so the panel never shows two. All three targets (life expectancy, premature death, injury deaths) have a breakdown.

In both modes the "County overall" row is that indicator's value from `values.json`. In model mode it repeats the model card's actual value on purpose, so the groups sit next to the figure they're compared with.

Content:

```
By race and ethnicity (CHR 2025)
  County overall            74.2   (73.8–74.6)
  American Indian and AN    66.1   (64.0–68.2)
  Hispanic or Latino        81.3   (79.9–82.7)
  White                     74.0   (73.5–74.5)
  Not reported: Asian, Black, Native Hawaiian and Pacific Islander.
  CHR does not report a group when there are too few births or deaths to give a stable figure.
```

- First row is the county's overall value from `values.json`, for comparison. Then one row per group with a value, in `groups` display order, each with value and CI formatted with the indicator's unit (`formatValue`).
- Each row has a small dot-and-interval mark on a shared axis for the section, so groups can be compared at a glance. The axis spans the rows shown (overall plus groups), not a regional range. Text values are the accessible content; the marks are `aria-hidden`.
- Unreliable values carry the same marker and wording the panel already uses for unreliable estimates.
- Groups with `null` are listed by label in one "Not reported:" line, followed by the explanation sentence. If every group is null, the section shows only that line and sentence (still listing the groups), so the absence is visible.
- No color encoding of better or worse between groups. The direction of the indicator is already stated by the indicator itself.
- The Valdez-Cordova legacy note does not apply; Chugach and Copper River simply show every group as not reported.

### 5.3 Loading

`loadData` fetches `strata.json` with the other four files and adds it to `AppData`. Type generation adds `strata.schema.json`. A light shape guard like `isModelFile` checks `indicators` is an object; failure gives the existing error page with a message naming `strata.json`.

### 5.4 Methodology and About

- Methodology gets a section "Outcomes by race and ethnicity": source (CHR 2025), which five measures, group definitions per CHR (§4.3), why groups go unreported, why the breakdown is not mapped or ranked, and that years pooled by CHR may differ from the overall measure (builder checks CHR documentation and states what is true).
- Methodology's demographics text lists the new "Who lives here" indicators and their universes, and repeats that `Demographics` indicators are never model features.
- README's indicator list and the About page are updated if they enumerate indicators.

## 6. Testing

- **Pipeline:** unit tests for the strata parse on a small CHR fixture (values, CIs, `source_scale`, flags → `unreliable`, blank → `null`, missing column → `FetchError`); strata validation (each rule in §4.5 passing and failing); export writes five files atomically; schema drift test covers `strata.schema.json`; catalog test rejects `race_groups` on non-CHR indicators.
- **Live run:** `pnw-health run` from the raw cache succeeds; `strata.json` validates against its schema; PNW counts per group match §2's table; `values.json` is unchanged apart from the new `Demographics` entries; `model.json` is unchanged apart from `built_at` and the reworded `Demographics` exclusion reason (§4.6), with metrics, flags and SHAP identical.
- **Catalog tests:** `race_groups` only on CHR entries; every `Demographics` indicator has a `profile`; exactly one `population` indicator, unit `count`.
- **Web unit tests:** `WhoLivesHere` (grouping and order from `profile`, population without bar, empty group not rendered); `RaceBreakdown` (shows only reported groups, "Not reported" line, all-null case, unreliable marker, hidden for indicators without strata); `CountyPanel` placement (Explore: under the indicator value; model mode: after the model card for the target, and no second breakdown in the indicator section); `loadData` with and without a valid `strata.json`.
- **Smoke (Playwright):** select a county with a breakdown and see the section; select an indicator without one and see it absent. `a11y.spec.ts` covers the panel with the breakdown open.

## 7. Left to the builder

- Exact visual of the dot-and-interval marks and the universe notes (§5.1, §5.2), within the existing panel styles.
- Whether `race_groups` uses `SkipJsonSchema` on the `Indicator` model or a separate config map (§4.1; catalog field preferred).
- Exact wording of methodology copy, after checking CHR's 2025 documentation on group definitions and pooled years.
- Task breakdown and issue split, in the M10 plan.
- Which pipeline stage parses strata (for example harmonize, with its own interim file), and adapting the panel's unreliable wording for values that have no rank.
- `v005` has no race CI columns, so the fetch check leaves them out for that measure.

## 8. Calls made without the author

Marked "my call" in the text: the model-mode placement of the breakdown (§5.2); rewording the `Demographics` exclusion reason, which changes one string in `model.json` (§4.6); and moving the "Who lives here" layout into the catalog as an exported `profile` field (§4.7).
