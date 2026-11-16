# Design guide

How the PNW Health Atlas looks and reads. The tokens live in `web/src/styles.css` and are the source of truth: this guide explains them, and if the two disagree, the code wins. Tests keep the colours honest: `web/src/theme/tokens.test.ts` (contrast and brand/data separation) and `web/src/test/tokenUsage.test.ts` (no raw colours, font sizes or radii outside the token files).

## Brand

- **Name:** PNW Health Atlas. **Tagline:** County health across Washington, Oregon, Idaho and Alaska.
- **Page titles:** `PNW Health Atlas`, `Methodology · PNW Health Atlas`, `About · PNW Health Atlas` (`web/src/brand/brand.ts`).
- **Direction:** Evergreen field guide. Inviting and restrained: rounded controls, generous spacing, saturation reserved for the data.
- **Mark:** a mint mountain with a snow notch and a sun, on a 24-unit grid (`web/src/brand/BrandMark.tsx`). It is drawn for a dark surface and is used on the fir header and as the favicon. Keep clear space of one sun-diameter (about 4.8 units of the 24-unit grid) on every side. Do not recolour it, stretch it or add effects.
- **The sun rule:** the sun colour (`#f2c46d`) is mark-only. It is not a token, and it never appears in the interface or in charts, because it sits near the data oranges.
- **Type:** Figtree Variable, self-hosted (`@fontsource-variable/figtree`). Use `tabular-nums` wherever figures align.

## Tokens

Light values are in `:root` and dark values in `.dark`, both in `web/src/styles.css`. Use a token, never a raw hex, font size or radius, in swept areas.

### Colour

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `--paper` | Page background | `#f2f5f1` | `#11181a` |
| `--surface` | Cards, panels, popovers | `#ffffff` | `#1b2427` |
| `--ink` | Body text | `#17252a` | `#e4eae9` |
| `--ink-muted` | Secondary text | `#52626a` | `#9aabb0` |
| `--line` | Hairlines and dividers | `#d6dcdb` | `#2f3b3f` |
| `--line-strong` | Control borders (3:1 on surface) | `#7c8a8d` | `#6e7f84` |
| `--wash` | Hover and muted fills | `#e9edec` | `#253034` |
| `--fir` | Header and brand surface | `#0f3b2c` | `#06150f` |
| `--header-ink` | Text on the fir header | `#f2f5f1` | `#e4eae9` |
| `--evergreen` | Accent: primary buttons, links, selection | `#2b6b55` | `#78c4a4` |
| `--evergreen-ink` | Text on evergreen | `#ffffff` | `#06150f` |
| `--fir-soft` | Mint tint for soft accents and selected rows | `#c6ecd8` | `#173c2d` |
| `--focus` | Focus ring on page surfaces | `#0f3b2c` | `#8fcfb3` |
| `--focus-on-fir` | Focus ring and accents on the fir header | `#8fcfb3` | `#8fcfb3` |
| `--alert` | Errors and destructive actions | `#b42318` | `#ff8a80` |

### Map and chart neutrals

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `--stage` | Map stage background (matches `palette.ts`) | `#ffffff` | `#161d20` |
| `--map-state-border` | State outlines | `#17252a` | `#c3ced1` |
| `--map-selected` | Selected county outline | `#000000` | `#ffffff` |
| `--map-selected-under` | Ring under the selected outline | `#ffffff` | `#000000` |
| `--map-hover` | Hovered county outline | `#333333` | `#f2f5f5` |
| `--map-inset-frame` | Alaska inset frame | `#7c8a8d` | `#7c8a8d` |
| `--swatch-border` | Legend and tier swatch borders (3:1) | `#6b7280` | `#8b9aa0` |
| `--chart-ink` | Chart text, and the dark-theme edge on coloured factor bars | `#374151` | `#d6dee0` |
| `--chart-muted` | Bars and the other counties | `#6b7280` | `#8b9aa0` |
| `--chart-band-75` | Reserved: no longer drawn, since the range chart uses the tier fills | `#e6e9ee` | `#263236` |
| `--chart-band-90` | Reserved: no longer drawn, since the range chart uses the tier fills | `#c9ced6` | `#364449` |

### Type, radius, spacing, elevation

| Token | Purpose | Value |
|---|---|---|
| `--text-xs` / `--text-sm` / `--text-base` / `--text-lg` / `--text-xl` / `--text-2xl` | The type scale | 0.75, 0.875, 1, 1.125, 1.25, 1.5 rem |
| `--text-display` | Large display figures | 2.5rem |
| `--text-fluid-title` / `--text-fluid-page` | Fluid headings | clamp, see `styles.css` |
| `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-full` | The radius scale | 0.25, 0.375, 0.5 rem, 9999px |
| `--radius` | Base radius behind Tailwind's `--radius-xl` | 0.5rem |
| `--header-height` | Site header height | 3.5rem |
| `--gutter` | Page side gutter | 1.25rem |
| `--shadow-float` / `--shadow-drawer` / `--shadow-pop` | Elevation: county panel, drawer, popovers and menus | retuned per theme |

Spacing uses Tailwind's default scale, consistently.

### Tailwind mapping

`@theme inline` bridges the tokens to Tailwind utilities, so components write `bg-primary` rather than a colour:

| Utility colour | Token |
|---|---|
| `background` / `foreground` | `--paper` / `--ink` |
| `card` / `card-foreground` | `--surface` / `--ink` |
| `primary` / `primary-foreground` | `--evergreen` / `--evergreen-ink` |
| `secondary`, `muted` | `--wash` |
| `muted-foreground` | `--ink-muted` |
| `accent` / `accent-foreground` | `--fir-soft` / `--ink` |
| `destructive` | `--alert` |
| `border` | `--line` |
| `input` | `--line-strong` |
| `ring` | `--focus` |
| `fir`, `header-ink` | `--fir`, `--header-ink` |

The font family is `--font-sans`.

## Components

Every wrapper in `web/src/components/ui` uses only tokens.

- **Button** (`button.tsx`, `buttonVariants`). Variants: `primary` (one main action per view), `secondary` (the default: bordered, for ordinary actions) and `ghost` (low emphasis, such as toolbar and icon actions). Sizes: `sm`, `md` (default) and `icon`. Style buttons through these variants, not ad hoc classes. Links that navigate but look like buttons use `asChild` with an `<a>`.
- **Badge:** a short label or status. **Toggle and ToggleGroup:** a choice that is shown at all times (for example the map mode). **Select and DropdownMenu:** a choice from a list. **Popover:** a small floating panel. **InfoTip** (`info-tip.tsx`): the one way to put an explanation behind an ⓘ, as a ghost icon button named "About …" that opens a popover. Definitions and methodology prose go there, not in the panel's flow. **Dialog:** a blocking task. **Drawer:** the phone county panel. **Command:** a filterable list (the measure picker and county search). **Input:** a text field.
- **Focus rule:** one global `:focus-visible` outline in `--focus`, 2px, 3:1 or better against every surface it sits on. No component sets its own ring. On the fir header the outline switches to `--focus-on-fir`, because the page's dark ring vanishes on fir.
- **Full-row fields** (the command filter, #278) have no outline. The wrapper shows focus with a 2px `--focus` bottom border and a `--wash` tint. Nested surfaces clip to their parent's radius, so a child never squares off a rounded corner.

### Methodology and About components

These live under `web/src/pages/` and use only tokens.

- **Reading rail** (`methodology/ReadingRail.tsx`, class `.reading-rail`). Use it for a long page of numbered steps that a reader jumps around in. From 721px it is a sticky left column listing each step with its sections. The site header is not sticky, so the desktop rail sticks 1rem from the top edge. On a phone it becomes a bar stuck to the top edge (`.reading-rail--phone`) that opens the same list, and every `.methodology [id]` carries a `scroll-margin-top` so a jump lands its heading below the bar. The section in view carries `aria-current="location"`. Tokens: `--ink` for links, `--ink-muted` for step names, `--line` for the left rule, `--evergreen` for the current rule and current step name, `--surface` for the phone bar, `--text-sm`.
- **Pipeline strip** (`methodology/PipelineHero.tsx`, `.pipeline-strip`). Use it as a page's overview when the page is a sequence of stages, each worth one figure. Each stage is a link to its heading. It is a 2×2 grid on phones and a single row from 721px. Tokens: `--surface` and `--wash` (hover) for the cards, `--line` and `--radius-lg` for the border, `--ink-muted` for labels, `--text-2xl` with `tabular-nums` for the figure, `--text-sm`.
- **Prose-and-evidence section** (`methodology/SectionLayout.tsx`, `.methodology-section--split`). Use it when a section has a short explanation and a table or chart that backs it up. Prose goes left (under about 65ch) and the evidence in a box on the right; below 721px, and for a section with no evidence, it is one column. Tokens: `--surface` and `--line` for the evidence box, `--radius-lg`, `--chart-muted` and `--evergreen` for any bars inside it.
- **Fold** (`methodology/Fold.tsx`, `.methodology-fold`). Use it for a long list or table the reader may not need. It is a closed `<details>` with a plain summary ("Show all 9 factors"), so find-in-page still reaches the content. Never fold an anchored heading; a deep link into a fold opens it first (`useHashFocus`). Tokens: `--evergreen` for the summary, `--text-sm`.
- **About panel** (`About.tsx`, `.about-panel`). Use it for one self-contained area of a case study: a title, one sentence, stack chips and one proof point. Panels sit in a 2×2 grid on desktop and one column on phones. Tokens: `--surface`, `--line` and `--radius-lg` for the card, `--text-xl` for the title, `--radius-full` and `--line` for the chips, `--text-sm`, and a 2px `--fir-soft` left rule for the proof point.

## Data colour rules

- **Ramps are data, never brand.** The directional ramp is ColorBrewer OrRd (`schemeOrRd[5]`), the neutral ramp is Blues (`schemeBlues[5]`), and the model tiers are RdBu (`#ca0020`, `#f4a582`, `#92c5de`, `#0571b0`) with `tierNone` and the hatch for no data. They never move for the brand. When a brand colour is too close to one, the brand colour moves.
- **Separation:** every brand colour is at least ΔE 15 (CIE76) from every data colour, in both themes. `web/src/color/dataColors.ts` lists the data colours and `tokens.test.ts` enforces it.
- **Neutral fields never get a good/bad ramp.** Demographic shares use Blues. A directional ramp is only for measures whose health meaning is clear, and it is labelled "More favorable" and "Less favorable".
- **The map stage stays neutral,** so data colours read the same in both themes.
- **The selected county on the strip plot** is an `--evergreen` dot with a `--surface` ring and an `--evergreen` rule through the strip. Evergreen marks "your county" without saying good or bad.
- **The model card's range chart** shows the tier fills as bands: `tierNone` in the middle, then the "somewhat" fills and then the "notably" fills on each side. Which side is red follows the outcome's direction, so it matches the badge and the map legend.
- **Factor bars** are coloured by favorability: the "notably" blue (`#0571b0`) when the factor moves the expected value the favorable way, and the "notably" red (`#ca0020`) when it moves it the less favorable way. The +/− labels keep the raw direction. "All other factors" stays `--chart-muted`. In the dark theme each coloured bar gets a 1px `--chart-ink` edge, because the red alone is under 3:1 there.

## Voice and copy

- **Plain words,** specific and short. Name the thing: "Uninsured adults", not "coverage gap".
- **Five sensitivity principles** (spec §7.2, table in Appendix A):
  1. Direction only where the health meaning is clear.
  2. Describe places, not people: "higher obesity prevalence", never about residents.
  3. Use the source's terms (ACS, CDC PLACES, County Health Rankings), and say so where a term is dated or narrow.
  4. Model tiers describe the model, not the county.
  5. Colour-blind safe and contrast-checked in both themes.
- **Vocabulary:** say "more favorable" and "less favorable", not better or worse. Rank 1 is "most favorable". The panel shows a rank as `10/139 counties (3rd in WA)`, and its accessible name and hover text read "10th most favorable of 139 counties, 3rd of 39 in Washington".
- **Race and ethnicity labels** are short ("White", "Asian"). "Hispanic or Latino (any race)" keeps its qualifier. The definition (every other group counts only people who are not Hispanic) lives in each description and in the Who lives here ⓘ. Model tiers say "higher" or "lower than expected", mapped from the outcome's direction. The tier labels are never a verdict on a county. The category is displayed "Health behaviors"; its exported value `Behaviors` is unchanged.
- **"Associated with", never "causes".** The model's factors are associated with its estimate. Keep copy consistent with the methodology page.
