# M11 Explorer Redesign — Design

**Date:** 2026-11-13
**Status:** Direction agreed in brainstorming; pending written-spec review
**Parent spec:** `2026-11-10-pnw-health-dashboard-design.md` (§6 Website). Builds on the UI overhaul merged as #228 (Tailwind v4, shadcn components, Lucide icons, tokens in `web/src/styles.css`). This document records only what M11 decides; where it is silent, the parent spec and the M5–M10 designs apply.

Items marked **(call)** were decided by the writer, not the author, and are open to correction in review.

## 1. Intent

The explorer is a map first. After #228 the map still shares the page with a 264px picker column and a 384px panel column, shrinks when a county is selected, and on tablet widths the panel opens below the fold. M11 makes the map the largest, steadiest thing on the page and moves everything else above it or over it.

**Goals**

1. The map is the most prominent element of the explorer and keeps the same size and position whatever the reader does.
2. The county panel opens over the map, and the map stays usable while it is open.
3. The left column is gone. Choosing a measure is one row: a category switch (Indicators, Demographics, Outcomes) and a searchable dropdown filtered by it.
4. "Model mode" is no longer a mode. The three modelled outcomes get an Observed / Compared with expected switch.
5. Alaska is large enough to see and select, including the Aleutians.
6. The borders between Washington, Oregon and Idaho are easy to see.
7. Dark mode.
8. Radix primitives replace the native and hand-built controls.

**Non-goals**

- Map zoom or pan.
- Branding. Palette and typeface may change in a later milestone, so M11 adds tokens, not new identity.
- Restructuring the panel's contents (section navigation, collapsing) or the Methodology and About layouts.
- Any pipeline, export-contract or `schema/` change. Web only.
- New data or indicators.

**Anti-goals** (failure even if everything works)

- The map moves or resizes when the panel opens, the measure changes or the legend changes height.
- The open panel blocks the map, so every new county costs a close and a click.
- A data color means something different in dark mode than in light mode.
- An existing shared link (`?mode=model&t=…`, `?i=…&c=…`) stops working.

## 2. Exit criteria

- At 1440×900 in map view, the whole map is visible without scrolling the page and is drawn at least 1000px wide. Its bounding box is identical before and after selecting a county, at 1440×900, 900×800 and 375×812; an e2e test asserts this.
- At 900×800, selecting a county shows the panel inside the viewport (today its top is at 869px).
- At 375×812 the top of the map is within 330px of the top of the page (today 471px).
- With the panel open on desktop, clicking another county on the map changes the panel to that county without closing it.
- Alaska is drawn at no less than twice its current area at 1440×900, and every county, including Aleutians East and Aleutians West, has a pointer target at least 24×24 CSS px at that size (today 83 counties fall short on desktop).
- State borders are drawn as a separate line at least 3:1 against the stage in both themes.
- `?mode=model`, with or without `t`, loads the matching outcome in Compared with expected and rewrites the URL to the new form.
- In both themes: axe reports no serious or critical violations on both Playwright projects, and the outline-contrast unit test passes for every fill the map can draw.
- No native `<select>` and no hand-built combobox, toggle group, dialog or sheet remains in `web/src` (the map tooltip and table sort buttons are exempt, §8).
- `ci` and `build-deploy` are green on `milestone/m11`. E2E runs locally with `CI=1` before each issue PR that touches it.

## 3. Approaches

**Panel behaviour.** Three were considered.

| | What | Trade-off |
|---|---|---|
| **A. Non-modal panel (chosen)** | Radix Dialog with `modal={false}` on desktop and tablet; shadcn Drawer (vaul) with snap points on phones | Map stays live; Escape and focus return come from the primitive; drag on phones. Most test rewriting, because the panel changes from a `complementary` landmark to a `dialog`. |
| B. Modal panel | The same primitives in their default mode | Simplest to make accessible, but the map is locked while the panel is open, which breaks exploring. |
| C. Float the current `<aside>` | CSS-position today's panel over the map | Least churn, but no drag on phones and it leaves a hand-built control. |

The author chose A.

**Compared-with-expected switch.** A two-way switch (Observed, Compared with expected) was chosen over a three-way one (Observed, Expected, Difference). The second side is today's five-tier better/worse map. The expected value itself stays in the panel and the table.

**Settled without alternatives**

- Measure dropdown and county search: shadcn Combobox (Radix Popover + `cmdk`). Radix Select has no search.
- Category, Observed/Compared and Map/Table switches: Radix ToggleGroup, `type="single"`, never empty. Radix Tabs does not fit: the category switch filters a dropdown and owns no tab panel.
- State borders: a line along shared state edges, not a gap, so county shapes stay true.

## 4. Page layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PNW Health Dashboard    Explorer  Methodology  About                  [theme] │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Indicators|Demographics|Outcomes] [Poverty rate ▾]     [⌕ county] [Map|Table] │
│ Poverty rate                                  [Observed|Compared with expected]*│
│ Description. Source line.                                                     │
│ ┌──────────────────────────────────────────────────────────┬───────────────┐ │
│ │ legend                                                   │ King County ✕ │ │
│ │                          WA / OR / ID                    │               │ │
│ │   Alaska (larger)        state borders                   │ panel floats  │ │
│ │                                                          │ over the stage│ │
│ └──────────────────────────────────────────────────────────┴───────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
  * shown only for the three modelled outcomes
```

- **Stage.** The map stage fills the width of the page and the height left under the header, toolbar and title block (minimum 480px). The map SVG is left-aligned and vertically centered in it (`preserveAspectRatio="xMinYMid meet"`), so the floating panel covers only the map's eastern edge. The stage never changes size in response to selection.
- **Legend.** Inside the stage, in the empty corner above Alaska, laid out so its height does not move the map **(call)**. On phones it sits under the map inside the stage.
- **Panel, ≥721px.** 400px wide, inset 12px from the stage's top, right and bottom edges, own scroll, sticky header, a shadow to lift it off the map. It floats over the stage in map view. In table view the table's scroll frame narrows to leave room for it, since a table has no size to keep stable and covering its right-hand columns would hide ranks **(call)**.
- **Panel, ≤720px.** A bottom drawer with snap points at 40% and 85% of the viewport, dragged by its handle. The Expand/Collapse button goes; Close stays.
- **Open question for the author.** At 721 to 1099px the 400px panel covers most of Washington, Oregon and Idaho, and in table view it leaves a narrow table. Nothing was changed for this width; it needs a decision on whether the panel should narrow, dock, or use the drawer at tablet widths.
- **Phone toolbar.** Category switch full width; measure dropdown full width; county search and Map/Table on one row. The description moves behind an information button (Radix Popover) so the map starts higher; the title and source line stay visible **(call)**.
- **No county selected.** A one-line hint in the stage ("Select a county for its details") until the first selection **(call)**.

## 5. Choosing a measure

- **Categories.** The manifest has five categories. Indicators = Social & Economic (8), Access (8) and Behaviors (4), shown as three headed groups in the dropdown. Demographics (14) and Outcomes (10) map one to one. The mapping lives in one place in the web app; an unknown manifest category falls under Indicators **(call)**.
- **Dropdown.** A button showing the current measure opens a popover with a filter input and the category's measures. Typing filters by label. Enter or click selects and closes; Escape closes and returns focus to the button.
- **Switching category** selects the measure last viewed in that category this session, or its first measure, so the map always shows something **(call)**. The category is derived from the selected measure; it has no URL parameter.
- **Observed / Compared with expected.** Shown only when the selected measure is a model target (`life_expectancy`, `premature_death`, `injury_deaths`, read from `model.json`, not hard-coded). Observed is the values map and table; Compared with expected is the tier map, `ModelLegend` and `ModelTable` as they are today. Leaving a modelled outcome for another measure returns to Observed.
- **Copy.** "Values" and "Model" as mode names disappear from the interface, About and README. The About "How to use it" list is rewritten to match.

### URL

| Param | Meaning | Notes |
|---|---|---|
| `i` | Selected measure | Unchanged |
| `c` | Selected county | Unchanged |
| `view` | `table`, or absent for map | Unchanged |
| `show` | `expected`, or absent for Observed | New. Dropped as invalid when `i` is not a model target. |
| `t` | Outcome shown in the panel's model card | Kept, but only meaningful when `i` is not a model target (§6). Dropped when `i` is one. |
| `mode` | Legacy | `mode=model` is rewritten, with `replace`, to `i=<t or the default target>&show=expected`; `mode=values` is dropped. |

## 6. County panel

- Radix Dialog, `modal={false}`, accessible name "County details" (a visually hidden title); the county name stays the panel's visible heading and focus target. `onInteractOutside` is prevented so clicking the map or the toolbar does not close it. Escape and Close close it and return focus as today (to the opener if it is still in the document, else the page heading).
- The existing focus rules stay: a county chosen from the map does not move focus; one chosen from search, the table or a similar-county button moves focus to the panel heading. `onOpenAutoFocus` is prevented and the existing logic kept.
- Section order is unchanged: in Compared with expected the model card comes first, otherwise the measure section first.
- **Model card on other measures (call).** Today the panel shows a model card on every measure, for the outcome in `t`. That stays: when the selected measure is a model target the card is for that outcome; otherwise the card carries its own small outcome select (Radix Select) in its heading, defaulting to life expectancy and stored in `t`. This replaces the Outcome picker that lived in the left column.
- Phone drawer: vaul `Drawer`, `modal={false}`, snap points `[0.4, 0.85]`, opening at 0.4. The page keeps bottom padding equal to the peek height while it is open, as now, so the bottom of the map stays reachable.

## 7. Map

- **Canvas.** A new `MAP_LAYOUT` with a wider canvas (about 1280×680) in which Alaska's block is roughly 544×484 at the lower left and the three contiguous states take the right. Exact extents are the builder's, subject to the exit criteria. Alaska keeps its frame and its "Alaska (not to scale)" label, with the label set so it renders at 11px or more at 1440×900 and stays legible on phones.
- **Small counties.** Each county whose drawn bounding box is under 24px on either side gets a transparent hit halo (a wider transparent stroke or a padded hit shape under the visible path) so it meets the target size. Halos do not change what is drawn and must not steal clicks from a neighbour's visible area more than necessary; where halos overlap, the smaller county wins.
- **State borders.** `topojson.mesh` over the county geometries with the filter `a.state !== b.state` gives the shared state edges. Drawn above the counties, non-interactive (`pointer-events: none`), about 1.5px, in a token that is 3:1 or better against the stage in both themes. Alaska has no shared edge and gets none.
- **Selected county.** Its outline must reach 3:1 against neighbouring fills and the stage in both themes; a two-ring stroke (light under dark) is the expected way.
- No zoom, no pan, and the tooltip stays the pointer-following one.

## 8. Radix inventory

| Today | M11 |
|---|---|
| Values/Model buttons | Removed (§5) |
| Map/Table buttons with `aria-pressed` | ToggleGroup |
| Indicator list with filter, phone disclosure | Category ToggleGroup + Combobox |
| Outcome native `<select>` (left column) | Radix Select in the model card (§6) |
| County search (hand-built combobox) | Combobox; same matching rules, state-name matches last, 8 options |
| County panel `<aside>` / CSS bottom sheet | Dialog (non-modal) / Drawer |
| Methodology outcome native `<select>` | Radix Select |
| — | DropdownMenu for the theme switch |
| Description on phones | Popover |

Components are added with the shadcn CLI into `web/src/components/ui` and restyled onto the tokens and the single global focus outline, as #228 did. Check each generated file's imports: the CLI previously pulled in an unrelated `cn` package.

**Stays hand-built:** the map tooltip (it follows the pointer; Radix Tooltip anchors to an element) and table sort headers (a native button in a `th` with `aria-sort` is already the right pattern).

## 9. Dark mode

- **Switch.** A header DropdownMenu with Light, Dark and System. System is the default. The choice is kept in `localStorage`; a small inline script in `index.html` sets the `dark` class on `<html>` before first paint so the page does not flash. Storage access is wrapped so a blocked store falls back to System.
- **Tokens.** `:root` keeps the light set; `.dark` redefines the same names. Every color in `styles.css` and every hard-coded color in the SVG charts (`ShapBars`, `ResidualRange`, `StripPlot`, `RaceBreakdown`, `WhoLivesHere`, `HatchSwatch`, map hover/selected/inset strokes) moves onto a token or `currentColor`. The Observable Plot strip chart is redrawn when the theme changes.
- **Data colors.** The sequential ramps (Blues, OrRd) and the four colored tiers are the same hex values in both themes, so a color always means the same thing. Three neutrals get dark counterparts because large pale areas glare on a dark stage: the "about as expected" tier, the no-data hatch background and its lines.
- **Contrast.** `outlineFor` keeps choosing each county's outline against its own fill, now given the active theme's neutrals. The outline-contrast unit test runs over both palettes. Legend swatch borders, state borders and the inset frame are 3:1 against the stage in both themes. Text tokens meet 4.5:1 on their surfaces.
- The map stage follows the theme (it is no longer fixed white).

## 10. Accessibility

Role changes are expected: the panel becomes a dialog, the switches become radio-style toggle groups, the pickers become comboboxes with a popup. Each issue updates the unit and e2e tests it breaks, keeping what they protect (focus return, skip link to the county search, touch targets of 44px on phones, keyboard reach of every control).

After the feature issues land, one issue writes a fresh accessibility pass, as the author asked: axe on every explorer state in both themes on both Playwright projects, and a keyboard-only walkthrough spec (choose a category and measure, switch to Compared with expected, search for a county, read the panel, pick a similar county, close, switch theme).

## 11. Spec changes

Made in the same PR as the code they describe.

| Spec | Section | Change |
|---|---|---|
| Parent spec | §6 Explorer | Layout: no picker column; toolbar; floating panel; map stage is fixed in size. "Model mode" becomes the Compared with expected view of a modelled outcome. URL table from §5. |
| M5 design | Model mode, outcome picker | Superseded by §5 and §6 here. |
| M6/M7 designs | Phone bottom sheet, Expand/Collapse | Superseded by the drawer in §4 and §6. |
| M7 design | §3.1 outline contrast | Extended to the dark palette (§9). |
| README | Screenshot, "What it does" | Regenerated; "Model mode" wording updated. |

## 12. Work breakdown

One issue each, in this order. Detailed steps belong to the M11 plan.

1. **Map canvas:** new layout, larger Alaska, state borders, hit halos, selected-county ring.
2. **URL and measure model:** the `show` parameter, measure groups, the legacy `mode` redirect; the Observed/Compared switch replaces the mode buttons.
3. **Toolbar, measure picker and fixed stage:** remove the left column, category ToggleGroup, Combobox, Map/Table ToggleGroup, legend in the stage, no-selection hint, phone description popover.
4. **County search:** Combobox.
5. **Floating panel:** non-modal Dialog, phone Drawer, model-card outcome select, table-view behaviour.
6. **Dark mode:** tokens, switch, chart and map colors, contrast tests.
7. **Remaining Radix swaps and docs:** methodology select, spec and README updates.
8. **Accessibility pass:** the new axe and keyboard specs.

1 is independent. 3 depends on 2; 4 and 5 depend on 3. 6 comes after 1–5 so it themes the final components. 8 is last. Between 2 and 5 the panel's outcome on non-modelled measures can only be set from the URL.

## 13. Left to the builder

- Exact canvas extents, legend placement within the stage corner, halo geometry.
- Dark token values, within the contrast rules in §9.
- Component file layout under `web/src`, and whether the category mapping lives with `parseParams` or beside the picker.
- Test structure, beyond the criteria in §2 and §10.

## 14. As built (2026-11-13)

Where the implementation differs from the text above:

- **Map canvas.** Alaska's extent is `[[16, 150], [560, 664]]`.
- **Pointer targets.** The minimum is 31 canvas units, 24 CSS px whenever the map is drawn at least 1000px wide. A halo under the counties only helps where no neighbour is drawn, so short counties get a pad instead: an invisible 31-unit square drawn over every county (`placePads`). Each is placed on a one-unit ownership raster of the canvas where it takes the fewest cells from other counties (cells of other short counties count eight times), smallest county first and drawn on top; a county that those pads leave short gets one too. A cell counts toward a county's reach only as part of a 2×2 block, so a sub-pixel gap between pads does not. Scattered island counties with a roomy box (fill under 15%) keep a 16-unit stroke halo under the counties. The hover outline follows the pointer onto a pad (`data-hover`). The e2e test samples `elementFromPoint` on a half-pixel grid at 1440×900 and finds a reachable box of at least 24×24 for all 149 counties on poverty rate and on life expectancy, Compared with expected.
- **URL.** `show=observed` is stripped as invalid. A legacy `mode=model` link is converted only when its target is a manifest indicator.
- **Stage height.** From 721px, map view makes the page a flex column that fills the viewport, and the stage takes the height the header, toolbar and title block leave (at least 480px), with no measured offset; at 1440×900 the page does not scroll. On phones the stage takes the map's natural height, with no 480px minimum. From 721px the model legend's note is hidden inside the stage.
- **Title block.** Its height does not depend on the measure, so the map keeps one box across every measure and both Show states. The measure button has a fixed width (18rem from 721px), so a long name cannot rewrap the toolbar. From 721px the heading has its own row (every heading fits one line) beside About this measure, the description is held to two lines (longer text is cut off there and read in full behind About this measure, which now shows at every width), and the Show switch sits in a slot at the end of the source line that keeps its height when there is no switch. On phones the heading always takes two lines' height (at 1.25rem), and in Compared with expected it is the outcome's label alone; the Show switch sits in the stage under the map (above the table in table view). The map's top is at 323px at 375×812 for every measure.
- **Panel.** The hidden dialog title "County details" is a span, not a heading. Table view leaves a 424px margin (the 400px panel plus a 12px gap) beside the panel. The phone drawer returns to its 40% position when the county changes. vaul's `modal={false}` is worked around with a nested non-modal Radix root.
- **Methodology page.** Its Outcome control is the Radix `Select`; the native select component was removed.
