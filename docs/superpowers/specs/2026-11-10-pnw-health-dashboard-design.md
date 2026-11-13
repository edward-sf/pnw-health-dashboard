# PNW Health Dashboard — Design Spec

**Date:** 2026-11-10
**Status:** Approved in brainstorming; pending written-spec review

## 1. Purpose and success criteria

A portfolio project demonstrating balanced full-stack data work — data engineering, machine learning, and front-end visualization — through a public website for exploring county-level public health data in Washington, Oregon, Idaho, and Alaska.

**Primary audience:** hiring managers and technical peers evaluating the author's skills.

**Success means:**
- A live, free, durable public URL (static hosting).
- A readable README and an in-site methodology page.
- Visible, green CI with meaningful tests across pipeline and web.
- Honest handling of data caveats: suppressed small-county values, Alaska geography changes, and association-vs-causation framing of ML results.

**Assumptions:** Python pipeline; desktop-first but usable on mobile; no accounts, no backend, no user data.

**Out of scope for v1:** state health-department portals, CDC WONDER, forecasting, clustering/typologies, sub-county geography (tracts), live model serving. These are deliberate deferrals; see §10 Future work. (Race-stratified outcomes were deferred here and are now in v1: see `2026-11-12-m10-race-outcomes-who-lives-here-design.md`.)

## 2. Architecture

Two independent halves joined by a versioned file contract.

```
pnw-health-dashboard/
├── pipeline/                     # Python 3.12 package, managed with uv
│   ├── src/pnw_health/
│   │   ├── sources/              # one module per source: fetch → data/raw/
│   │   │   ├── places.py         #   CDC PLACES county data (Socrata API)
│   │   │   ├── chr.py            #   County Health Rankings annual CSV
│   │   │   ├── acs.py            #   Census ACS 5-year (Census API)
│   │   │   └── geo.py            #   Census cartographic county boundaries
│   │   ├── harmonize.py          # FIPS normalization, Alaska fixes, long-format table
│   │   ├── indicators.py         # loads/validates indicators.yaml catalog
│   │   ├── indicators.yaml       # curated indicator catalog
│   │   ├── validate.py           # pre-export data quality checks
│   │   ├── model/                # features, training, CV, SHAP, residual flags
│   │   ├── contract.py           # Pydantic models for exported files
│   │   ├── export.py             # writes web artifacts + JSON Schema
│   │   └── cli.py                # `pnw-health run [--stage fetch|harmonize|model|export]`
│   └── tests/
│       └── fixtures/             # small recorded source responses
├── web/                          # Vite + React + TypeScript
│   ├── src/
│   └── public/data/              # pipeline export target (git-ignored; built in CI)
├── docs/                         # specs, plans
└── .github/workflows/            # ci.yml, build-deploy.yml
```

**Data flow:** fetch → `data/raw/` (cached; reruns skip network) → harmonize → tidy long table `(fips, indicator_id, year, value, ci_low, ci_high, source)` → model → export to `web/public/data/` → static site build → GitHub Pages.

**Key boundary:** the web app has no knowledge of sources. It reads only the exported files in §4.

## 3. Data sources and harmonization

### Sources (all federal, uniform across states)
| Source | Use | Access |
|---|---|---|
| CDC PLACES (county) | Model-based prevalence of chronic conditions, behaviors, prevention | Socrata API on data.cdc.gov |
| County Health Rankings (CHR) | Model outcomes (life expectancy, premature death, injury deaths), access measures, rurality | Annual national CSV download |
| Census ACS 5-year | Social/economic features and display indicators | Census Data API (**key required**: `CENSUS_API_KEY` env var / repo secret; keyless requests are redirected to an HTML error page) |
| Census cartographic boundary files | County geometry (`cb_2024_us_county_5m`; same county set as 2020-vintage FIPS for the four states) | Census TIGER/cartographic downloads |

CDC WONDER is excluded: its API does not support sub-national queries.

Display covers the **149 county-equivalents** in the four states (WA 39, OR 36, ID 44, AK 30). Sources are fetched **nationally** (~3,100 counties) because the model trains on all US counties (§5).

### Indicator catalog
A curated `indicators.yaml` of ~30–40 indicators. Each entry: `id`, `label`, `unit`, `source`, `source_field`, `year`, `category` (Outcomes / Behaviors / Access / Social & Economic / Demographics), `direction` (`higher_is_better` | `higher_is_worse` | `neutral`), `description`, optionally `profile` (population / age_sex / race / other, which places Demographics indicators in the "Who lives here" section) `universe` (the population a measure is a share of, when that would otherwise mislead), and, on CHR entries only, `race_groups` (the race and ethnicity groups CHR breaks the measure down by; pipeline-only, feeds `strata.json`).

**Demographics category:** the ACS population profile: total population, age and sex shares, race/ethnicity shares (AI/AN, Hispanic, Black, Asian, NHPI, White, two or more races), and disability, veteran, foreign-born and limited-English shares. (`age_65_plus` stays in Social & Economic because it is a model feature, but carries the age/sex `profile`.) These are descriptive context only — `direction: neutral` (no ranks, neutral sequential color scale) and never used as model features (§5).

### Harmonization rules
- **Geography:** 2020 Census vintage FIPS, zero-padded 5-character strings.
- **Alaska renames:** Wade Hampton (02270) → Kusilvak (02158) is remapped.
- **Alaska split:** Valdez-Cordova (02261) → Chugach (02063) + Copper River (02066). Values reported only for 02261 are **not** copied to successors; successors are null (`v: null`) for that indicator/vintage and carry a `legacy` reference instead: `{fips: "02261", name: "Valdez-Cordova Census Area (former)", year, v, lo, hi}`. Current sources no longer report 02261, so its values come from CHR 2023 and carry that vintage in `year`. The pipeline logs a warning. Legacy rows are excluded from model training and from ranks.
- **Suppressed/missing values** stay null — never imputed for display.
- **Unreliable estimates** keep their value and rank and are marked in the panel and table.
- **Confidence intervals** are carried through wherever the source provides them.

### Validation (runs before export; any failure aborts)
- Exactly 149 display FIPS; per-state counts match (39/36/44/30).
- Percent-unit values within [0, 100]; non-negative counts/rates.
- No duplicate `(fips, indicator_id)` keys in display data.
- Every catalog indicator has data for at least one county, and for at least one county in every PNW state unless that state is listed for it in `PARTIAL_STATES` (pipeline-only, empty in M8; M8 spec §3.5).

## 4. Export contract (`web/public/data/`)

Defined once as Pydantic models in `contract.py`. JSON Schema generated from those models is committed in `schema/`, and a pipeline test fails if it drifts from them; the web build generates TypeScript types from it, so contract drift breaks the build.

The five files are written as a set: into a temporary directory under `data/interim/` (never under `web/public/`, which Vite copies into the site), then moved into place only after all five writes succeed, so a failed export leaves the previous one untouched (M8 spec §3.1).

| File | Contents |
|---|---|
| `manifest.json` | `schema_version`, `built_at`, source vintages, indicator catalog (indicators carry optional `profile` and `universe`) |
| `counties.topojson` | Simplified boundaries; properties `fips`, `name`, `state` |
| `values.json` | `{indicator_id: {fips: {v, lo, hi, rank, state_rank, legacy?}}}` — nulls allowed for `v/lo/hi`; ranks direction-aware, null when `v` is null or indicator is `neutral`; optional `legacy` (including its `year`) per §3; optional `unreliable`, present only when the source marks the value unreliable |
| `model.json` | One entry per target under `targets` (M9 spec §2.4), each holding the target's `label`, `unit` and `direction` and: metrics (national + PNW subset) for ridge and LightGBM; `behaviors_comparison` metrics for the main and behaviors-included models on shared counties; global feature importance; flag thresholds (`sigma_model`, `z` per tier); `model_card` data; and per PNW county: `actual`, `predicted`, `residual`, `se`, `threshold_75`, `threshold_90`, `flag`, top-5 SHAP `{feature, value, contribution}`, `base_value`. A top-level `peers` block (M9 spec §3.2) holds `method` `{features, k, min_features}` and `counties`: for each PNW county, its `k` nearest PNW counties on the model features, nearest first, or `[]` when it has too few features |
| `strata.json` | CHR outcomes by race and ethnicity (M10 spec §4.3): `dimension` (`race`), `source` (`chr`), `year`, `groups` `[{id, label}]` in display order, and `indicators` `{indicator_id: {groups, counties: {fips: {group: {v, lo, hi, unreliable?} or null}}}}` for each catalog indicator with `race_groups`. Every display county and listed group is present; `null` where CHR reports no value. No ranks: these values are never ranked, mapped or used by the model |

`flag` ∈ `notably_better` | `somewhat_better` | `none` | `somewhat_worse` | `notably_worse` | `insufficient_data`.

All files are small enough to load up front.

## 5. Machine learning

**Question answered:** given a county's social and economic profile, how does its outcome (one of three, named under Targets below) compare to what we'd expect nationally, and which factors are associated with that expectation? The residual answers the first part; SHAP answers the second. SHAP does not explain the residual, which is the part of the outcome the features leave unexplained.

- **Training population:** all US counties with a non-null target and at least one non-null feature (~3,100; Connecticut's former counties drop out because ACS reports planning regions instead). Explanation and display: the 149 PNW counties.
- **Targets:** CHR life expectancy (the default), premature death and injury deaths (M9 spec §2.1). Each is modelled separately with the shared features, folds and parameters.
- **Features:** social/economic only, from ACS and CHR — median household income, poverty rate, uninsured rate, educational attainment, unemployment, age structure (% 65+), rurality, severe housing cost burden, broadband access. Final list lives in config.
  - **Excluded:** health behaviors (on the causal path; would restate the outcome) and race/ethnicity shares (proxies for structural factors; SHAP attributions would mislead). Rationale documented on the methodology page.
  - Missing feature values: median imputation fitted within each training fold.
- **Models:** ridge regression baseline (standardized features) and LightGBM. Both reported.
- **Behaviors comparison:** a second LightGBM model with PLACES health-behavior measures (smoking, obesity, physical inactivity, binge drinking) added to the features. It and the main model are refit on the same counties (those with every behavior measure) so the difference is like for like. Only its CV metrics are reported — on the methodology page, as "how much do behaviors add?" — never its SHAP values or predictions.
- **Validation:** 5-fold CV grouped by state. Metrics: RMSE, MAE, R² — national and PNW subset.
- **Residuals:** `residual = actual − predicted`, from out-of-fold predictions of the main LightGBM model only.
- **Flags (two tiers):** each county gets its own threshold combining model error and its own measurement uncertainty.
  - `se_i = (ci_high − ci_low) / (2 × 1.96)` from the county's CI for the selected target.
  - `σ_resid²` = variance of national OOF residuals; `σ_model² = max(σ_resid² − mean(se_i²), 0)` (removes average measurement noise already present in residuals; mean over counties with a CI).
  - `threshold_p(i) = z_p × sqrt(σ_model² + se_i²)`, with `z_75 = 1.150` and `z_90 = 1.645` (two-sided 75% and 90% ranges). If a county lacks a CI, `se_i² = mean(se_i²)`.
  - `|residual| > threshold_90` → `notably_better`/`notably_worse`; `> threshold_75` → `somewhat_better`/`somewhat_worse`; otherwise `none`. Sign is direction-aware: for a `higher_is_better` target (life expectancy) a positive residual is better; for a `higher_is_worse` target (premature death, injury deaths) a negative residual is better.
  - `insufficient_data` when the target is null.
- **Explanations:** TreeSHAP through LightGBM's built-in `pred_contrib`, from the fold model that produced each county's out-of-fold prediction, so `base_value` plus contributions equals `predicted`; top-5 contributions per PNW county plus global mean |SHAP| importance across all out-of-fold explanations. Contributions explain the expected value relative to the base value, not the residual.
- **Reproducibility:** fixed seeds, pinned dependencies (uv lockfile), auto-generated model card rendered on the methodology page.
- **Framing:** UI and docs use "factors associated with," never "drivers" or causal language.

## 6. Website

**Stack:** Vite, React, TypeScript, React Router, d3-geo (SVG map), Observable Plot (charts).

**Why SVG + d3-geo rather than MapLibre:** a composite projection (Albers for WA/OR/ID plus a scaled Alaska inset) avoids Mercator distortion of Alaska; no tile basemap or API keys; 149 DOM elements are easy to style, test, and make accessible.

### Routes
- `/` — Explorer. All state in URL: `?i=<indicator_id>&c=<fips>&t=<target_id>&mode=values|model&view=map|table`. `t` defaults to the first model target and is kept in both modes.
- `/methodology` — sources and vintages, harmonization rules, ML method, model card, caveats.
- `/about` — project overview and author links.

GitHub Pages SPA routing handled via a `404.html` redirect fallback.

### Explorer
- **Indicator picker:** grouped by category, searchable.
- **Map:**
  - *Values mode:* direction-aware sequential color scale, quantile bins, legend; hatch pattern for suppressed/missing.
  - *Neutral indicators (Demographics):* neutral single-hue sequential scale; no ranks.
  - *Model mode:* 5-class diverging scale by flag tier (notably worse → notably better), hatch for `insufficient_data`.
  - *Mode toggle:* a Values/Model toggle beside Map/Table sets `mode`. In model mode an "Outcome" select (the model targets, `t`) replaces the indicator picker, and `i` is kept for values mode; the title and legend describe the chosen outcome compared with expected.
  - Hover tooltip; click selects county.
- **County panel** (right drawer on desktop, bottom sheet on mobile; phone behavior is specified in `2026-11-11-m6-methodology-polish-design.md` §5), in this order in values mode. In model mode the model card comes first, then the indicator value with its strip plot, then "Who lives here" (amended in M7, #130):
  - Selected indicator value with CI; rank among 149 and within state. If `v` is null and `legacy` exists: "Reported only for the former Valdez-Cordova Census Area (combined area, CHR {year}): {v}" with a methodology link.
  - Strip plot of all 149 counties with the selected one highlighted.
  - Model card (shown in both modes): actual vs expected value of the selected target, residual with its 75%/90% ranges, flag tier, top-5 SHAP bar chart plus an "All other factors" row so the bars reconcile to the expected value, labeled as factors associated with the expected value, kept visually and textually apart from the flag so it never reads as explaining the gap.
  - "Who lives here": Demographics shares, visually and textually separate from the model card, with no wording linking them to the flag.
  - "Similar counties" (last, in both modes; added in M9, #183): the selected county followed by its nearest PNW peers on the 9 social and economic features, with the peers' median. Values mode shows the indicator value; model mode shows actual, expected and flag tier. Each peer name is a button that selects that county like a map click. A county with too few features shows "Not enough data to find similar counties." The copy never relates peers to the flag and uses no causal wording.
- **Table view:** sortable table of the current indicator across all counties (in model mode: actual, expected, difference and flag tier); together with a county search box, this is the keyboard and screen-reader path to every county.

### State and data loading
URL params plus a single `useData()` hook that fetches the four files once. No global store, no query library.

### Error states
- Data files fail to load → full-page error with retry.
- Unknown indicator/FIPS in URL → fall back to defaults and clear the bad param.
- Null value → "Suppressed or not available" with explanation link to methodology.

## 7. Testing

**Pipeline (pytest; ruff; mypy):**
- Source parsers against recorded fixtures — no network in tests.
- Harmonization: Alaska remap and split handling (including `legacy` attachment and exclusion from ranks/model), suppression passthrough, long-format output.
- Flags: threshold formula on hand-computed cases — tier boundaries, sign convention, missing-CI fallback, `σ_model²` floor at 0.
- Validation: each check has a failing-input test.
- Model: smoke test on synthetic data — output shapes, OOF residuals, determinism under seed, SHAP additivity (contributions sum to prediction − base value).
- Export: outputs validate against Pydantic contract.

**Web (Vitest + Testing Library; ESLint; `tsc --noEmit`):**
- Color scale and rank logic, URL state parsing, county panel rendering from committed fixture export files.
- One Playwright smoke test against the built site: load → pick indicator → click county → panel and URL update → switch to model mode.

## 8. CI/CD

- **`ci.yml`** (PRs into and pushes to `main` and `milestone/**`): pipeline lint, typecheck, tests; web lint, typecheck, unit tests. No real data fetched.
- **`build-deploy.yml`** (push to `main` or `milestone/**`, monthly cron, manual dispatch): run full pipeline with raw-data cache keyed by source vintage → build site → Playwright smoke test → deploy to GitHub Pages. The deploy step runs only on `main`, so milestone pushes prove everything except the publish before the milestone PR is approved. Any failure means no deploy; last good site stays live.
- Secrets: `CENSUS_API_KEY` (required — free key from https://api.census.gov/data/key_signup.html).

## 9. Build order (vertical slices)

1. Pipeline skeleton + ACS source → harmonize → validate → export (`manifest`, `counties.topojson`, `values.json`).
2. Web skeleton (map rendering ACS indicators, indicator picker, URL state) **plus** `ci.yml` and `build-deploy.yml` — the site is live on GitHub Pages at the end of this slice, and every later slice deploys automatically.
3. PLACES and CHR sources; full indicator catalog (incl. Demographics); county panel, legacy display, and table view.
4. ML pipeline → `model.json` (main model, ridge baseline, behaviors comparison, flags, SHAP).
   - **Checkpoint:** stop and review model metrics, residual/flag distribution, and sample SHAP output with the author before slice 5. If PNW performance is weak, revise the ML design before building model UI.
5. Model mode on the map and model card in the county panel.
6. Methodology/about pages (incl. model card, behaviors comparison, feature-exclusion rationale), README, polish.

## 10. Future work (deliberately deferred)

Race-stratified outcomes, once listed here, are part of v1 (M10): see `2026-11-12-m10-race-outcomes-who-lives-here-design.md`.

- **State health-department datasets** (WA DOH, OHA, IDHW, AK DOH) as state-specific spotlight indicators.
- **Forecasting** from time series (pending a credible approach for small counties).
