# M13 Explorer Content Review — Design

Date: 2026-11-15 · Milestone: M13 Branding (closing pass) · Status: draft for author approval

## Intent

M13 closes with a content pass on the Explorer. Three things today make it harder to read than it needs to be:

- The heading's description appears twice.
- The race labels are long.
- The county panel is cluttered.

The goal is legibility. Every element on screen should earn its place. A county Atlas page will carry the fuller detail later.

**Non-goals.**
- No new data.
- No Atlas page.
- No change to the model, the map or the data colours themselves.

**Anti-goals.**
- Don't create panel modes or state that the Atlas page would later have to undo. For that reason the full model card stays in both Observed and Compared modes.
- Don't lose accuracy: definitions move behind ⓘ buttons rather than being deleted.

## Constraints

- The data colours never move (spec §4, `docs/design-system.md`). The tier fills are RdBu `#ca0020`, `#f4a582`, `#92c5de` and `#0571b0`, plus `tierNone`. Red and blue always mean less and more favorable, mapped by the outcome's direction.
- Model copy says "associated with", never "causes".
- Tokens only; the raw-value guard covers `web/src`.
- Contrast: chart marks need 3:1 against `--surface` in both themes, and text needs 4.5:1.
- Spec Appendix A is the record of approved labels. A label change updates it in the same PR, and `pipeline/tests/test_sensitivity_review.py` keeps checking it.

## Approaches

The author chose each item in a section-by-section walkthrough. Two choices had real alternatives:

- **Selected county on the strip plot:**
  - **Chosen:** an `--evergreen` dot with a surface-coloured ring and a thin vertical line through the strip, with the other dots faded slightly.
  - **Rejected:** matching the map's black-and-white selection. It's still dark on grey, so it gets lost in dense clusters.
- **Factor bar colour:**
  - **Chosen:** colour by favorability. Blue means the factor moves the expected value toward the favorable side, red toward the less favorable side, and the +/− labels keep the raw direction.
  - **Rejected:** blue for any factor that raises the expected value. That would contradict the site's colours on `higher_is_worse` outcomes such as Premature death.
- **Model card in Observed mode:**
  - **Chosen:** keep it in full, to avoid mode-dependent panel state.
  - **Rejected:** collapsing it to a single line.

## Design

### 1. Explorer heading

Remove the clamped description paragraph under the heading (`indicator-description--clamped` in `Explorer.tsx`). The description lives only behind the "About this measure" ⓘ, as it already does on phones. The title block's height must still not depend on the measure, so the map never moves.

### 2. Race and ethnicity labels

In `pipeline/src/pnw_health/indicators.yaml`:
- **Drop ", not Hispanic"** from the six non-Hispanic group labels: White, Black, American Indian and Alaska Native, Asian, Native Hawaiian and Pacific Islander, and Two or more races.
- **Keep "Hispanic or Latino (any race)".**
- **Descriptions are unchanged.** They already say "not Hispanic or Latino and reports … alone".

Update Appendix A's Indicators rows for the `pct_*` race labels to record the change, under principle 3: the definition moves into the description and the ⓘ.

### 3. County panel

The order is unchanged. In Compared mode the model card still comes first.

**Header.** The county name and state go on one line, as "King County, WA". The close button is unchanged.

**The measure.**
- Keep:
  - the measure name, small;
  - the value;
  - the unreliable-estimate note.
- Remove:
  - the CI line;
  - the race breakdown (`RaceBreakdown`), in both places it appears, including the target's breakdown after the model card in Compared mode. It moves to the Atlas page later.
- **Rank** reads `10/139 counties (3rd in WA)`, using the state's postal code. Its accessible name and `title` give the full wording: "10th most favorable of 139 counties, 3rd of 39 in Washington". Neutral measures still show no rank.
- **Strip plot:**
  - The selected county is an `--evergreen` dot with a ring in the surface colour, plus a thin vertical rule in `--evergreen` through the strip's full height at its value.
  - The other dots fade a little more than today.
  - The screen-reader sentence ("King County: 81.1 years. Higher than 129 of 139…") stays.

**Model card**, the same in both modes.
1. **The heading** ("Life expectancy model") and the outcome switcher stay. The heading gets an ⓘ holding today's range paragraph: "A difference beyond ±2.3 years is flagged as somewhat higher or lower, and beyond ±3.3 years as notably. These ranges allow for the model's typical error and this county's own measurement uncertainty."
2. **"How this county compares"** is removed.
3. **Actual, Expected and Difference** become three columns, each with its label above its value, so nothing wraps at the panel's narrowest width.
4. **"Figures are rounded."** is removed.
5. **The tier badge** stays.
6. **The range chart** gets the tier fills:
   - inside ±the 75% threshold, `tierNone`;
   - between the 75% and 90% thresholds, the "somewhat" fill on each side;
   - beyond the 90% threshold, the "notably" fill on each side.
   - Which side is red follows the outcome's direction, so the chart agrees with the badge and the map legend. The county's dot and the tick labels stay readable on every fill.
7. **The factors heading** becomes "Associated factors", with an ⓘ holding two lines: "They describe what the model expects for a county with this profile; they don't explain the difference above." and today's stand-in paragraph ("Some factors stand in for others the model doesn't see…"). The "starting point 74.88 → 81.29" intro and the stand-in paragraph below the bars are removed.
8. **The factor bars** keep the same factors and order. Each is coloured by favorability using the "notably" fills (`#0571b0` and `#ca0020`). Against `--surface` these measure 5.26 and 5.95:1 in light, but only 3.01 and 2.66:1 in dark. In the dark theme each bar therefore gets a 1px `--chart-ink` outline, so its edge meets 3:1 (my call). The +/− value labels carry the meaning in either theme. The "All other factors" bar stays neutral (`--chart-muted`), because it is a remainder, not a factor (my call). The value labels keep their +/− signs.

**Who lives here.**
- **Total population, and Age and sex:** unchanged.
- **Race and ethnicity:**
  - **Labels:** the short labels from §2.
  - **The note** moves behind an ⓘ on the "Race and ethnicity" subheading and leads with the definition: "Every group except Hispanic or Latino counts only people who are not Hispanic." The rest of today's note follows: shares don't overlap, multiracial people are counted under two or more races (so AIAN undercounts them), and Some other race isn't shown.
- **Other:** the four figures stay. The universe lines ("Civilian noninstitutionalized population" and the like) move into each label's hover text and accessible description.
- **Layout:** each group's rows are label | value, in two columns where the panel's width allows.

**Similar counties.**
- **The basis sentence** becomes "Counties with the most similar social and economic profile." Its ⓘ lists all nine matching measures and links to the methodology.
- **In Observed mode** the table is unchanged: County | Value, this county first, five peers, and the peer median.
- **In Compared mode** the table has three columns: County | Actual | Compared. The Compared column is a dot in the tier fill plus a short label (Notably lower, Somewhat higher, About as expected, Not enough data), worded by the outcome's direction. The Expected column is removed.

### 4. Shared ⓘ

Every new ⓘ uses the same component as "About this measure" in the Explorer heading: a ghost icon button with an accessible name, opening a popover. Factor it out if it isn't already shared (builder's call).

## Left to the builder

- Exact spacing, the faded-dot opacity, and the width of the strip's rule.
- Where the Who lives here grid switches between one and two columns.
- Whether the measure picker needs a "Race and ethnicity" grouping now that labels such as "White" stand alone. Today the Demographics list already uses short labels such as "Female" and "Veterans".
- Updating `docs/design-system.md` (vocabulary, the selected-county mark and the factor colours) and the methodology page wherever they quote removed copy.
- Tests:
  - unit tests for the new copy, the rank format and its accessible name, the factor colour mapping for both directions, and the absent breakdown and CI;
  - an e2e check that the panel has no horizontal overflow at the narrowest panel width in both modes;
  - an axe check in both themes.

## As built

These are the differences from the design above, all made in the PR for #336.

- **Panel props:** `CountyPanel` no longer takes `strata` or `targetIndicator`, since nothing in the panel uses them. `RaceBreakdown.tsx` stays in the code for the Atlas page.
- **Methodology:** the race-breakdown section now says the panel doesn't show the breakdowns, and drops its sentences about how the panel listed and flagged groups.
- **Similar counties ⓘ:** it names every matching measure ("Matched on … and …."). The old sentence named three and counted the rest.
- **Range chart:** the county's dot keeps its tier fill and gets a 1.5px `--chart-ink` ring, so it reads even on a band of its own colour, including the grey middle band. A `--surface` ring was tried first, and on the light theme it left an about-as-expected dot nearly invisible.
- **Model figures:** set in `--text-sm` without wrapping, so "5,529 per 100k" fits three columns at 320px.
- **Rate columns:** in Compared mode, per-100k values still wrap in the Similar counties Actual column, as they did before. The county column needs the width at 320px.
- **Band tokens:** `--chart-band-75` and `--chart-band-90` are no longer drawn, but they stay in `styles.css`. The token tests and the design guide still list them.
