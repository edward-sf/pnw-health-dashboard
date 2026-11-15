# M13 Branding — Design

**Date:** 2026-11-14
**Status:** Approved by the author (2026-11-14)
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§6 Website). Builds on M11 (`2026-11-13-m11-explorer-redesign-design.md`), which added tokens but deliberately no identity. This document records only what M13 decides; where it is silent, the parent spec and the M5–M11 designs apply.
**Workflow:** M13 is the first milestone run by the M12 graph (`2026-11-14-m12-workflow-engineering-design.md` §5.10).

Items marked **(call)** were decided by the writer, not the author, and are open to correction in review.

## 1. Intent

The author is about to demo this project from their portfolio website. Today it is "PNW Health Dashboard": no mark, no favicon, no social preview, a cool-neutral palette chosen only to stay out of the data's way, and ten Radix wrappers that have drifted apart (#278). M13 gives the site a clear, memorable identity suited to public health, and a design system that keeps it consistent.

Two feelings define success. A visitor should **trust the information**, and should **feel drawn to explore** it. A playful consumer-app look would cost the first; a grey government-report look would cost the second.

Alongside the brand, M13 runs a **scoped sensitivity review** of how every field is coloured and worded, so the identity a visitor trusts is also careful about the places and people it describes.

**Goals**

1. The site is named **PNW Health Atlas**, with the tagline *County health across Washington, Oregon, Idaho and Alaska.*
2. A brand in the **Evergreen field guide** direction (§4): fir-green header, mountain-and-sun mark, Figtree, rounded controls.
3. One token system (colour, type, spacing, radius, elevation, focus) that every component uses, in light and dark themes.
4. A short written design guide in `docs/` covering tokens, component use, voice and copy rules.
5. Every indicator, demographic field, race and ethnicity group and model outcome has a recorded sensitivity decision (§7), and the site matches it.
6. Five backlog issues folded in (§8).

**Non-goals**

- Renaming the repository or moving the site. The GitHub Pages path stays `/pnw-health-dashboard/`; hosting is the separate "Migrate off GitHub Pages" milestone.
- A landing or intro page. The Explorer stays the front door at `/`.
- A live style-guide page on the site.
- New data, indicators or model changes. The pipeline changes only where the sensitivity review changes catalog wording or a direction (§7).
- Choosing new data ramps for brand reasons. Ramps change only if the sensitivity review says so.
- The other `future` backlog issues (§8).

**Anti-goals** (failure even if everything works)

- A brand colour can be mistaken for a data colour, on the map, legend or charts, in either theme.
- Any text or control pair drops below its WCAG AA contrast in either theme.
- Wording that blames or characterises a county's residents, or puts a value judgment on a demographic group.
- The model's tiers read as a verdict on a county rather than a comparison with what the model expected.
- The brand looks like an outdoors or tourism brand rather than a data reference.
- A shared link stops working.

## 2. Exit criteria

- "PNW Health Dashboard" no longer appears in `web/`, `README.md` or `CONTRIBUTING.md` (older specs and plans keep it as history). The header shows the wordmark and tagline; page titles read `PNW Health Atlas`, `Methodology · PNW Health Atlas`, `About · PNW Health Atlas`.
- `index.html` and `404.html` carry an SVG favicon, a PNG fallback, an Apple touch icon, a `theme-color` for each scheme, and Open Graph and Twitter card tags with a 1200×630 preview image. A unit or e2e test asserts the tags and that each referenced file exists in the build.
- Archivo is gone from `package.json` and `styles.css`; Figtree Variable is self-hosted through `@fontsource-variable/figtree`.
- `tokens.test.ts` checks every text, control and focus pair in both themes, including the pairs #272 lists and every new brand token, and checks that no interface token falls within a set distance (ΔE, the builder's call) of any colour in the data ramps or tier colours.
- No component in `web/src/components/ui` or `web/src` uses a raw hex colour, an off-scale radius or an off-scale font size outside `styles.css` and `src/color/` (a lint rule or a test enforces it, the builder's call).
- `docs/design-system.md` exists and covers §5.4.
- On the About page, the GitHub and LinkedIn profile links render as SVG icon buttons with accessible names. A unit test asserts their names and hrefs.
- The sensitivity decision table (§7.3) is committed, and a test checks that every catalog indicator, race group and model outcome appears in it. The catalog, web copy and methodology page match it.
- #277, #278, #272, #274 and #296 are closed by M13 PRs; #274's findings are fixed or filed.
- axe reports no serious or critical violations on both Playwright projects in both themes.
- `ci` and `build-deploy` are green on `milestone/m13` after every merge.

## 3. Approaches

| | What | Trade-off |
|---|---|---|
| **A. Tokens first, review alongside (chosen)** | #296 first. Then the brand track (tokens → components → brand surfaces → legend → cross-browser check) and the review track (apply the approved decision table) run interleaved. The design guide is last, documenting what landed. | The two tracks rarely touch the same files, so the graph can interleave them. Nothing visible changes until the brand surfaces land. |
| B. Visible brand first | Header, mark and wordmark first, tokens retrofitted after | Visible on day one, but components are restyled twice and contrast problems surface late, against the pilot's "at most one fix PR" target. |
| C. Review first, then brand | Settle all language before any styling | Copy rules ready early, but the whole milestone waits on the review, and the brand does not depend on it except the legend end labels. |

The author chose A.

## 4. Brand identity

**Name and tagline.** *PNW Health Atlas*: an atlas is a reference people trust and a thing they browse, and it says "maps" without saying it. The tagline names the four states, which handles Alaska not being part of the Pacific Northwest. The Explorer keeps its name: you explore the atlas.

**Direction: Evergreen field guide.** Rooted in the region, inviting, restrained. Reference mockup: card B in `.superpowers/brainstorm/` (local only); its values are the starting point, not final.

| Role | Light starting value | Notes |
|---|---|---|
| Fir (header, headings accent) | `#14302a` | Header background; wordmark is light on fir |
| Evergreen (actions, links, accent) | `#2b6b55` | Primary buttons and selected states |
| Mint (soft accent, mark) | `#8fcfb3` | Tints and the mountain in the mark |
| Paper (page) | `#f2f5f1` | Replaces today's `--paper` |
| Sun (mark only) | `#f2c46d` | **Never used in the interface or charts (call)**: it sits near the data oranges |

The hex values are starting values: the builder adjusts them as needed to pass the contrast and data-separation tests, keeping the hue family. Dark-theme values are the builder's, held to the same tests.

**Token mapping (call).** Today's single `--fir` accent (`#1f5c4a`) splits in two: `--fir` becomes the header and brand-surface colour, and a new `--evergreen` takes over actions, links and selected states (every current use of `--fir` as an accent moves to it). `--fir-soft` becomes the mint tint. Other names stay. The shadcn mapping in `@theme inline` stays the bridge to Tailwind.

**Data colours are fixed (call).** Both ramps, the four model tier colours (`web/src/model/modelView.ts`, RdBu), `tierNone` and the hatch never move for the brand. When a brand colour is too close to one, the brand colour moves.

**Mark.** A simple mountain with a sun, drawn as SVG on a small grid so it reads at 16px. Variants: on fir (header), on paper, and monochrome. The favicon is the mark alone.

**Type.** Figtree Variable for everything, self-hosted (call). Figures use `tabular-nums` wherever numbers align (already used in places). A modular type scale with named steps replaces ad-hoc sizes.

**Tone.** Inviting but restrained: rounded controls (pill buttons, as in the mockup, are the builder's call per component), generous spacing, saturation reserved for the data. Copy is plain and specific; see §5.4.

**Unchanged.** The data ramps (`schemeOrRd`, `schemeBlues`), the hatch for no data and the map outline logic keep their meaning. The map stage stays neutral so data colours read the same as today.

## 5. Design system

### 5.1 Tokens

One source in `web/src/styles.css`, light in `:root` and dark in `.dark`:

- **Colour:** brand (§4), neutrals, text, lines, states (focus, alert), map and chart neutrals. `--stage` keeps its test against `src/color/palette.ts`.
- **Type:** family, the scale steps, weights, line heights.
- **Spacing:** a single scale (Tailwind's default spacing is acceptable if used consistently, the builder's call).
- **Radius:** one scale (e.g. sm, md, lg, full). Nested surfaces clip to their parent's radius (#278).
- **Elevation:** the three existing shadows, retuned for the brand.
- **Focus:** one focus style, 3:1 against every surface it can sit on. Full-row fields (the command filter) use the row treatment from #278 instead of an outline.

### 5.2 Components

Every wrapper in `web/src/components/ui` (badge, button, command, dialog, drawer, dropdown-menu, input, popover, select, toggle, toggle-group) uses only tokens. Button gets named variants (primary, secondary, ghost) and sizes; the rest keep their APIs. Explorer, panel, table, legend and pages are swept for raw values, and callers that style buttons ad hoc move to the variants in the same sweep (call). To keep each task's file set bounded, the plan splits the sweep by area (for example explorer and map; panel and table; pages and shell).

### 5.3 Brand surfaces

- Header: mark, wordmark and tagline on fir; nav (Explorer, Methodology, About) restyled. On phones the tagline may drop (builder's call) but the wordmark stays.
- `index.html` and `public/404.html`: titles, favicon set, `theme-color`, Open Graph and Twitter tags, preview image. Both pages use the same icon paths under Vite's `base`.
- **Absolute URLs (call).** `og:url`, `og:image` and `twitter:image` need an absolute origin. It comes from one build-time setting (a Vite env variable, e.g. `VITE_SITE_ORIGIN`) defaulting to the current GitHub Pages origin, so the hosting move later changes one value.
- **Icon and preview assets (call).** The mark's SVG is the committed source. The PNG fallback, Apple touch icon and the 1200×630 preview are committed as static assets in `web/public/` (they are assets, not data). The preview shows the wordmark, tagline and a stylised map. No generator script is required.
- `usePageTitle` strings, About and Methodology copy, `README.md` and `CONTRIBUTING.md`.
- **Profile links as icon buttons (author).** The About page's author GitHub and LinkedIn links (`web/src/pages/About.tsx`, today plain text links) become SVG icon buttons, using the button tokens and a visible focus state.
  - **Semantics:** they stay `<a>` elements, because they navigate, styled as buttons. Each has an accessible name ("GitHub profile", "LinkedIn profile"), a target of at least 24×24 CSS px, and a tooltip or visible label (builder's call).
  - **Icons (call):** the official GitHub and LinkedIn marks, inlined as monochrome SVG in a small brand-icons component and themed with `currentColor`. Lucide v1 ships no brand icons, and the marks must not be recoloured beyond each brand's monochrome rules.
  - **Scope (call):** the "Source code" and "MIT license" links stay inline text links, because they sit inside a sentence.
- The legend (#277): one ordered scale, with the end labels attached to the first and last bins at every width, including the model tier legend and the phone layout, within the corner constraints #277 lists.

### 5.4 Design guide

`docs/design-system.md` (call), short and reviewable:

- Brand: name, tagline, mark use and clear space, the sun rule.
- Tokens: what each is for, with light and dark values, and how they map to Tailwind.
- Components: when to use each, variants, and the focus rule.
- Data colour rules: ramps are data, never brand; neutral fields never get a good/bad ramp.
- Voice and copy: plain words; the sensitivity principles (§7.2); "associated with", never "causes" (AGENTS.md).

## 6. Pilot constraints

M13 is judged against M11 (M12 spec §5.10): at most one fix PR after the final review, no red `build-deploy` after a merge, tokens per task at least 30% below M11's. So:

- #296 lands first, so a known flake can't redden CI.
- Each task touches a clear set of files, and its acceptance is checkable by the gates (tests, lint, contrast and coverage assertions above), not by taste.
- All taste decisions are settled before the run: this spec settles the brand; the sensitivity table is approved with the plan (§7.3).
- Task sizing (call): about as many tasks as M11 (eight) to keep tokens per task comparable. Each task is one reviewable PR with a bounded file set. Neither many tiny tasks (fixed overhead per task) nor one large one.

## 7. Sensitivity review

### 7.1 Scope

Every catalog indicator (44 in `pipeline/src/pnw_health/indicators.yaml`), the 7 race and ethnicity groups (`RACE_GROUP_LABELS`), and the modelled outcomes and their tiers. For each: the ramp and its direction, the legend end labels, and the label, description, tooltip and panel wording (including model tier names and sentences). The methodology page's language about these fields is in scope too.

### 7.2 Principles (agreed with the author)

1. **Direction only where the health meaning is clear.** Measures like uninsured, life expectancy and premature death keep a better/worse ramp. Demographic shares stay neutral.
2. **Describe places, not people.** Wording is about a county's rates ("higher obesity prevalence"), never about its residents. Behaviour measures (smoking, binge drinking, obesity, physical inactivity) and mental health measures get the closest look.
3. **Use the source's terms** (ACS, CDC PLACES, County Health Rankings), and say so where a term is dated or narrow. For example "Female" is the ACS sex item.
4. **Model tiers describe the model, not the county:** "higher than the model expected", not "worse".
5. **Colour-blind safe and contrast-checked** in both themes.

The author asked for a general careful pass, not one aimed at a particular reader or harm.

### 7.3 Output and when it is made

A decision table in **Appendix A** of this spec: one row per field, with the current ramp, end labels and wording, the proposed change (or "keep"), and the reason against §7.2.

**When (author):** the M12 graph has no author stop between plan approval and the milestone merge except escalation. So the writer of the plan **drafts the full table during planning**, the author **approves it with the plan**, and the run only applies it. This keeps the author's one review in the existing plan gate rather than adding a new kind of gate during the pilot.

Because the table is approved before the plan is final, the plan knows which changes it holds and sizes the apply work to match: a pipeline task only if the table changes catalog text or a direction, a web-copy task only if it changes web wording. No speculative tasks.

The apply work changes the catalog (`indicators.yaml` labels, descriptions, directions), the web copy (legend end labels in `makeColorScale.ts`, model tier wording, panel sentences), and the methodology page, with tests that pin the new wording. If a direction changes, the export contract and committed schemas are regenerated in the same PR (AGENTS.md).

## 8. Backlog

**Folded in**

| Issue | Why |
|---|---|
| #296 pages404 e2e flaky under 4× throttle | A red run fails a pilot target; lands first |
| #277 Legend reads as a grid | Visual identity of the map; touches the legend restyle anyway |
| #278 Picker focus outline and corner radii | Exactly the inconsistency the radius scale and focus rule fix |
| #272 Remaining colour-token contrast pairs | Tokens are being replaced; the tests are extended anyway |
| #274 iOS Safari and Firefox check | Demo readiness; runs last, against the finished brand |

**Left out:** the accessibility, keyboard, performance and test-tidy chores (#253–#273, #275, #276). They don't serve the brand, and a focused scope keeps the pilot's tokens-per-task comparison fair. **#306** (workflow residual minors) stays parked for the M13 retro, as its issue says.

## 9. Decided by the author

- Name *PNW Health Atlas* with the four-state tagline; no fuller rename.
- Direction B, Evergreen field guide.
- Design system level 2: tokens and components consistent in code, plus a written guide in `docs/`.
- The sensitivity review scope and the five principles; a general careful pass.
- The Explorer stays the front door; no intro.
- Backlog: fold in #296, #277, #278, #272, #274.
- Approach A.
- The GitHub and LinkedIn profile links are SVG icon buttons, not text links (§5.3).
- The sensitivity table is drafted during planning and approved with the plan (§7.3).

## 10. My calls (the author can overturn them)

- The sun yellow is mark-only.
- Figtree is self-hosted through Fontsource.
- The guide lives at `docs/design-system.md`; the decision table is Appendix A of this spec, so `wf setup` commits it with the spec.
- The repo name and Pages path stay.
- `--fir` splits into `--fir` (header) and `--evergreen` (actions); `--fir-soft` becomes mint (§4).
- Data colours, including the model tiers, are fixed; the brand moves around them (§4).
- Button callers migrate to the new variants, swept by area (§5.2).
- The social-tag origin comes from one build-time setting (§5.3).
- Icon PNGs and the preview image are committed assets (§5.3).
- About eight tasks, one PR each (§6).
- The trial "Lower / Higher" legend labels from the mockup are not decided; the review decides end labels.

## 11. Left to the builder

- Dark-theme brand values, the exact type scale and spacing scale.
- The mark's final drawing and the preview image, within §4.
- The ΔE threshold for brand-versus-data separation, and whether off-scale values are caught by lint or a test.
- Per-component rounding (pill or radius-lg) within one scale.
- Whether the tagline drops on phones.
- How #296 is fixed, provided the test waits on an observable condition.

## 12. As built

Deviations from this spec, with the PR that made each.

- **Token values (#321).** `--fir` and `--fir-soft` moved off the starting values (fir `#0f3b2c`, fir-soft `#c6ecd8` light and `#173c2d` dark, dark fir `#06150f`) so every brand colour is at least ΔE 15 from every data colour in both themes. The radius scale (`--radius-sm/md/lg`) is plain `:root` tokens; Tailwind's defaults match, so the self-referencing `@theme inline` entries were dropped. `DATA_COLORS` lists only the hex tier fills, because the hatch is a `url()` pattern.
- **Button and sweep (#322).** `Button` variants are `primary | secondary | ghost` and sizes `sm | md | icon`; `outline` callers moved to `secondary`. The raw-value guard needed `styles.css` swept in full, which added `--text-display`, `--text-fluid-title` and `--text-fluid-page`; odd sizes snap to the nearest scale step. The command filter's focus is a 2px `--focus` bottom border with a `--wash` tint, and `web/e2e/keyboard.spec.ts` accepts it.
- **Explorer sweep (#323).** The explorer, map, panel, table and search sources already used tokens, so the widened guard passed without edits. SVG chart `fontSize` attributes and in-text link-style buttons were left alone.
- **Header and brand surfaces (#324).** `ThemeMenu.tsx` gets header-ink styling. On phones the header is two rows (brand, then nav with the theme button at its right end), with no DOM reordering. The tagline hides below 720px, not 480px. The favicon PNG, Apple touch icon and preview image were rasterised from the mark with no committed generator. `404.html` writes the social URLs out with the default origin, since `public/` is not processed by Vite.
- **Legend (#325).** The model legend uses compact rows inside the map stage so its six rows clear the Alaska inset frame.
- **Sensitivity review (#326).** The legend test asserts the end labels are anchored to the first and last bins, because "More favorable" and "Less favorable" are wider than a swatch. The flip e2e asserts the first legend item in TIERS order ("Notably lower" for Life expectancy, "Notably higher" for Premature death). Tier sentences in `ResidualRange.tsx` and `ModelCard.tsx` also read "higher or lower than expected".
- **Cross-browser check (#329).** Firefox and iOS Safari are opt-in Playwright projects behind `E2E_ALL_BROWSERS=1`, not part of PR `ci`. `firefox` runs `smoke|stage|brand` (it cannot emulate touch or a phone viewport, so `mobile` is excluded). `mobile-safari` runs `smoke|mobile|stage|brand`; its failures are test and emulation issues (#327, #328), and `styles.css` needed no fix.

## Appendix A — Sensitivity decision table

Approved by the author with the M13 plan (2026-11-14).

Every catalog indicator, race and ethnicity group and modelled outcome, judged against the five principles in spec §7.2:

1. Direction only where the health meaning is clear.
2. Describe places, not people.
3. Use the source's terms, and say so where a term is dated or narrow.
4. Model tiers describe the model, not the county.
5. Colour-blind safe and contrast-checked.

**Colour (principle 5), for every row.** The ramps are ColorBrewer OrRd (directional) and Blues (neutral). The model tiers use RdBu with a neutral grey. All three are ColorBrewer's colour-blind-safe schemes, so no ramp changes. Contrast of outlines and swatch borders is already tested; M13's token tests extend it (#272).

**Scope of change.** No direction changes and no export-contract change. The catalog gets three description edits. Everything else is web copy.

### Site-wide decisions

| # | Where | Today | Decision | Why |
|---|---|---|---|---|
| G1 | Map legend end labels (`web/src/color/makeColorScale.ts`) | "Better" / "Worse" | **"More favorable" / "Less favorable"** | Principle 2: favourability describes a rate, not a verdict on the place. It is also the one vocabulary used by G2–G5. |
| G2 | Model tier labels (`web/src/model/modelView.ts`) | "Notably worse than expected" … "Notably better than expected" | **By direction: "Notably higher than expected", "Somewhat higher than expected", "About as expected", "Somewhat lower than expected", "Notably lower than expected"**, mapped from the flag and the outcome's direction (table below). "Not enough data" unchanged. | Principle 4: a tier says where the value sits against the model's estimate. Favourability is carried by colour (blue favourable, red unfavourable) and by G3. |
| G3 | Model legend (`web/src/model/ModelLegend.tsx`) | Tier names only | **Add a caption: "Blue: more favorable than expected. Red: less favorable."** | With G2 the tier names no longer say which way is good. The caption restores that without colour being the only cue, because the tier text still states higher or lower. |
| G4 | Model difference note (`web/src/model/targetView.ts`) | "Higher is worse for this measure, so a positive difference means worse than expected." | **"Lower is more favorable for this measure, so a positive difference is less favorable than expected."** | Principles 2 and 4. |
| G5 | Rank summary (`web/src/panel/rankSummary.ts`) | "… (1 = best)" | **"… (1 = most favorable)"** | Principle 2: rank 1 is the most favourable rate, not the best county. |
| G6 | Methodology, model section (`web/src/pages/methodology/ModelSection.tsx`) | Heading "Better or worse than expected"; paragraph in better/worse terms | **Heading "Higher or lower than expected"**; paragraph restated with G2–G4 wording and the sentence: "The tiers compare a county with the model's estimate; they are not a judgment of the county." | Principle 4. |
| G7 | Methodology, indicator catalog (`web/src/pages/methodology/IndicatorCatalog.tsx`) | Direction column "higher is better" / "higher is worse"; intro "colored so that better reads the same way" | **"higher is more favorable" / "lower is more favorable"**; intro "colored so that the more favorable end reads the same way on every map" | Same vocabulary as G1. |
| G8 | Category display name | "Behaviors" (picker groups, catalog heading) | **Display "Health behaviors"**. The exported category value `Behaviors` is unchanged (it is a schema enum). | Principle 3: County Health Rankings' term. The bare "Behaviors" reads as a judgement of residents' conduct (principle 2). |

### Model outcomes and tier mapping

| Outcome | Direction | `notably_better` | `somewhat_better` | `somewhat_worse` | `notably_worse` |
|---|---|---|---|---|---|
| `life_expectancy` | higher is better | Notably higher than expected | Somewhat higher than expected | Somewhat lower than expected | Notably lower than expected |
| `premature_death` | higher is worse | Notably lower than expected | Somewhat lower than expected | Somewhat higher than expected | Notably higher than expected |
| `injury_deaths` | higher is worse | Notably lower than expected | Somewhat lower than expected | Somewhat higher than expected | Notably higher than expected |

Flag names in the export (`notably_better` …) are unchanged; only the displayed labels change.

### Indicators

"Keep" means the ramp, direction, end labels (after G1) and wording pass all five principles as they are.

| Indicator | Category | Direction | Decision | Note |
|---|---|---|---|---|
| `median_household_income` | Social & Economic | higher is better | Keep | |
| `poverty_rate` | Social & Economic | higher is worse | Keep | |
| `unemployment_rate` | Social & Economic | higher is worse | Keep | |
| `bachelors_or_higher` | Social & Economic | higher is better | Keep | Education is a social determinant in CHR, scored the same way. |
| `uninsured_rate` | Access | higher is worse | Keep | |
| `broadband_households` | Access | higher is better | Keep | |
| `diabetes` | Outcomes | higher is worse | Keep | "Adults diagnosed with": a rate, person-first. |
| `coronary_heart_disease` | Outcomes | higher is worse | Keep | |
| `copd` | Outcomes | higher is worse | Keep | |
| `depression` | Outcomes | higher is worse | Keep | "Ever told they have a depressive disorder" is PLACES' wording and is a diagnosis, not a trait. |
| `high_blood_pressure` | Outcomes | higher is worse | Keep | |
| `frequent_mental_distress` | Outcomes | higher is worse | Keep | |
| `current_smoking` | Behaviors (G8) | higher is worse | Keep | Close look (principle 2): the description is a prevalence ("percent of adults who currently smoke"), not a description of residents. |
| `obesity` | Behaviors (G8) | higher is worse | Keep | Close look: person-first ("adults with obesity"). It stays in this category because CHR places adult obesity under health behaviours and the model's feature rules depend on the category. |
| `physical_inactivity` | Behaviors (G8) | higher is worse | Keep | Close look: "no leisure-time physical activity" is the source's narrow definition and already says so. |
| `binge_drinking` | Behaviors (G8) | higher is worse | Keep | Close look: "who report binge drinking" is a self-reported prevalence. |
| `routine_checkup` | Access | higher is better | Keep | |
| `dental_visit` | Access | higher is better | Keep | |
| `life_expectancy` | Outcomes | higher is better | Keep | Model outcome: see the tier table. |
| `premature_death` | Outcomes | higher is worse | Keep | Model outcome. |
| `low_birth_weight` | Outcomes | higher is worse | Keep | |
| `injury_deaths` | Outcomes | higher is worse | **Change description** to "Deaths from intentional and unintentional injury per 100,000 population." | Principle 3: CHR's measure includes suicide and homicide as well as accidents. Saying so is more accurate and less likely to be misread. Model outcome. |
| `primary_care_physicians` | Access | higher is better | Keep | |
| `mental_health_providers` | Access | higher is better | Keep | |
| `dentists` | Access | higher is better | Keep | |
| `preventable_hospital_stays` | Access | higher is worse | Keep | "Ambulatory-care sensitive conditions" is the source's term. |
| `food_insecurity` | Social & Economic | higher is worse | Keep | |
| `severe_housing_cost_burden` | Social & Economic | higher is worse | Keep | |
| `percent_rural` | Social & Economic | neutral | Keep | Rurality is context, not a health judgement: neutral is right. |
| `total_population` | Demographics | neutral | Keep | |
| `age_under_18` | Demographics | neutral | Keep | |
| `age_65_plus` | Social & Economic | neutral | Keep | Its category differs from `age_under_18` because the model's feature rules require it; it is a display grouping only. |
| `pct_female` | Demographics | neutral | **Change description** to "Percent of the total population whose sex is recorded as female in the American Community Survey." | Principle 3: the ACS asks about sex, with two options. The label stays "Female"; the description names the source's narrow definition. |
| `pct_hispanic` | Demographics | neutral | Keep | Census term. |
| `pct_white` | Demographics | neutral | Keep | |
| `pct_black` | Demographics | neutral | Keep | |
| `pct_aian` | Demographics | neutral | Keep | The undercount of multiracial American Indian and Alaska Native people is already explained in the Who lives here note. |
| `pct_asian` | Demographics | neutral | Keep | |
| `pct_nhpi` | Demographics | neutral | Keep | |
| `pct_two_or_more` | Demographics | neutral | Keep | |
| `pct_disability` | Demographics | neutral | Keep | Person-first ("with a disability"). Neutral is right. |
| `pct_veterans` | Demographics | neutral | Keep | |
| `pct_foreign_born` | Demographics | neutral | Keep | |
| `pct_limited_english` | Demographics | neutral | **Change description** to "Percent of the population 5 and over who speak English less than \"very well\", in the American Community Survey's wording." | Principle 3: the label is the Census's own phrase and a deficit framing. Keep it for accuracy, but attribute it. |

### Race and ethnicity groups (CHR breakdowns)

The breakdown plots each group's value on a shared neutral axis with no better/worse colouring, so principle 1 is met.

| Group | Label | Decision | Note |
|---|---|---|---|
| `aian` | American Indian and Alaska Native | Keep | CHR term. |
| `asian` | Asian | Keep | For `preventable_hospital_stays`, "Asian and Pacific Islander" as CHR reports it (already handled by `race_labels`). |
| `black` | Black | Keep | CHR term. |
| `hispanic` | Hispanic or Latino | Keep | |
| `nhopi` | Native Hawaiian and Pacific Islander | Keep | |
| `white` | White | Keep | |
| `tom` | Two or more races | Keep | |

The breakdown's suppression sentence ("CHR does not report a group when there are too few cases to give a stable figure") is accurate and neutral: keep.
