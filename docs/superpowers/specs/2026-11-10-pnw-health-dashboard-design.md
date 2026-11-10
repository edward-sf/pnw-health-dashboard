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

**Out of scope for v1:** state health-department portals, CDC WONDER, forecasting, clustering/typologies, sub-county geography (tracts), live model serving.

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
| County Health Rankings (CHR) | Life expectancy (ML target), premature death, access measures, rurality | Annual national CSV download |
| Census ACS 5-year | Social/economic features and display indicators | Census Data API (optional key via secret) |
| Census cartographic boundary files | County geometry (2020 vintage) | Census TIGER/cartographic downloads |

CDC WONDER is excluded: its API does not support sub-national queries.

Display covers the **149 county-equivalents** in the four states (WA 39, OR 36, ID 44, AK 30). Sources are fetched **nationally** (~3,100 counties) because the model trains on all US counties (§5).

### Indicator catalog
A curated `indicators.yaml` of ~30–40 indicators. Each entry: `id`, `label`, `unit`, `source`, `source_field`, `year`, `category` (Outcomes / Behaviors / Access / Social & Economic), `direction` (`higher_is_better` | `higher_is_worse`), `description`.

### Harmonization rules
- **Geography:** 2020 Census vintage FIPS, zero-padded 5-character strings.
- **Alaska renames:** Wade Hampton (02270) → Kusilvak (02158) is remapped.
- **Alaska split:** Valdez-Cordova (02261) → Chugach (02063) + Copper River (02066). Values reported only for 02261 are **not** copied to successors; successors are null for that indicator/vintage, and the pipeline logs a warning.
- **Suppressed/missing values** stay null — never imputed for display.
- **Confidence intervals** are carried through wherever the source provides them.

### Validation (runs before export; any failure aborts)
- Exactly 149 display FIPS; per-state counts match (39/36/44/30).
- Percent-unit values within [0, 100]; non-negative counts/rates.
- No duplicate `(fips, indicator_id)` keys in display data.
- Every catalog indicator has data for at least one county.

## 4. Export contract (`web/public/data/`)

Defined once as Pydantic models in `contract.py`. Export also writes JSON Schema; the web build generates TypeScript types from it, so contract drift breaks the build.

| File | Contents |
|---|---|
| `manifest.json` | `schema_version`, `built_at`, source vintages, indicator catalog |
| `counties.topojson` | Simplified boundaries; properties `fips`, `name`, `state` |
| `values.json` | `{indicator_id: {fips: {v, lo, hi, rank, state_rank}}}` — nulls allowed for `v/lo/hi`; ranks direction-aware, null when `v` is null |
| `model.json` | Model metrics (national + PNW subset, ridge + LightGBM), global feature importance, and per PNW county: `actual`, `predicted`, `residual`, `flag` (`better` / `worse` / `none` / `insufficient_data`), top-5 SHAP `{feature, value, contribution}`, `base_value` |

All files are small enough to load up front.

## 5. Machine learning

**Question answered:** given a county's social and economic profile, how does its life expectancy compare to what we'd expect nationally — and which factors are associated with the gap?

- **Training population:** all US counties with non-null target (~3,100). Explanation and display: the 149 PNW counties.
- **Target:** CHR life expectancy. Target is configurable; v1 ships one target.
- **Features:** social/economic only, from ACS and CHR — median household income, poverty rate, uninsured rate, educational attainment, unemployment, age structure (% 65+), rurality, severe housing cost burden, broadband access. Final list lives in config.
  - **Excluded:** health behaviors (on the causal path; would restate the outcome) and race/ethnicity shares (proxies for structural factors; SHAP attributions would mislead). Rationale documented on the methodology page.
  - Missing feature values: median imputation fitted within each training fold.
- **Models:** ridge regression baseline (standardized features) and LightGBM. Both reported.
- **Validation:** 5-fold CV grouped by state. Metrics: RMSE, MAE, R² — national and PNW subset.
- **Residuals:** from out-of-fold predictions only.
- **Flags:** `better`/`worse` only when |residual| exceeds both 1 SD of national OOF residuals and the county's own life-expectancy CI half-width; `insufficient_data` when the target is null.
- **Explanations:** SHAP TreeExplainer on the final LightGBM model (trained on all counties); top-5 contributions per PNW county plus global mean |SHAP| importance.
- **Reproducibility:** fixed seeds, pinned dependencies (uv lockfile), auto-generated model card rendered on the methodology page.
- **Framing:** UI and docs use "factors associated with," never "drivers" or causal language.

## 6. Website

**Stack:** Vite, React, TypeScript, React Router, d3-geo (SVG map), Observable Plot (charts).

**Why SVG + d3-geo rather than MapLibre:** a composite projection (Albers for WA/OR/ID plus a scaled Alaska inset) avoids Mercator distortion of Alaska; no tile basemap or API keys; 149 DOM elements are easy to style, test, and make accessible.

### Routes
- `/` — Explorer. All state in URL: `?i=<indicator_id>&c=<fips>&mode=values|model&view=map|table`.
- `/methodology` — sources and vintages, harmonization rules, ML method, model card, caveats.
- `/about` — project overview and author links.

GitHub Pages SPA routing handled via a `404.html` redirect fallback.

### Explorer
- **Indicator picker:** grouped by category, searchable.
- **Map:**
  - *Values mode:* direction-aware sequential color scale, quantile bins, legend; hatch pattern for suppressed/missing.
  - *Model mode:* diverging scale on life-expectancy residuals.
  - Hover tooltip; click selects county.
- **County panel** (right drawer on desktop, bottom sheet on mobile):
  - Selected indicator value with CI; rank among 149 and within state.
  - Strip plot of all 149 counties with the selected one highlighted.
  - Model card: actual vs expected life expectancy, flag, top-5 SHAP bar chart labeled "factors associated with."
- **Table view:** sortable table of the current indicator across all counties; together with a county search box, this is the keyboard and screen-reader path to every county.

### State and data loading
URL params plus a single `useData()` hook that fetches the four files once. No global store, no query library.

### Error states
- Data files fail to load → full-page error with retry.
- Unknown indicator/FIPS in URL → fall back to defaults and clear the bad param.
- Null value → "Suppressed or not available" with explanation link to methodology.

## 7. Testing

**Pipeline (pytest; ruff; mypy):**
- Source parsers against recorded fixtures — no network in tests.
- Harmonization: Alaska remap and split handling, suppression passthrough, long-format output.
- Validation: each check has a failing-input test.
- Model: smoke test on synthetic data — output shapes, OOF residuals, determinism under seed, SHAP additivity (contributions sum to prediction − base value).
- Export: outputs validate against Pydantic contract.

**Web (Vitest + Testing Library; ESLint; `tsc --noEmit`):**
- Color scale and rank logic, URL state parsing, county panel rendering from committed fixture export files.
- One Playwright smoke test against the built site: load → pick indicator → click county → panel and URL update → switch to model mode.

## 8. CI/CD

- **`ci.yml`** (every push/PR): pipeline lint, typecheck, tests; web lint, typecheck, unit tests. No real data fetched.
- **`build-deploy.yml`** (push to `main`, monthly cron, manual dispatch): run full pipeline with raw-data cache keyed by source vintage → build site → Playwright smoke test → deploy to GitHub Pages. Any failure means no deploy; last good site stays live.
- Secrets: optional `CENSUS_API_KEY`.

## 9. Build order (vertical slices)

1. Pipeline skeleton + ACS source → harmonize → validate → export (`manifest`, `counties.topojson`, `values.json`).
2. Web skeleton: map rendering ACS indicators, indicator picker, URL state.
3. PLACES and CHR sources; full indicator catalog; county panel and table view.
4. ML pipeline → `model.json`.
5. Model mode on the map and model card in the county panel.
6. Methodology/about pages, CI/CD workflows, deployment, README, polish.
