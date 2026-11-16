# M14 Methodology and About Redesign — Design

Date: 2026-11-15 · Milestone: M14 · Status: approved by the author

## Intent

The primary audience for the site is hiring managers and technical peers evaluating the author (spec 2026-11-10, "Primary audience"). The Methodology and About pages are where that audience goes to judge the work. Today, both pages are flat, long-scrolling prose. The content is accurate and worth keeping. The presentation doesn't engage the reader or make good use of the screen.

After a minute or two on these pages, a hiring manager should come away confident in the work. They should see that the author cares about both the validity and the presentation of what they build, and they should want to consider the author as a candidate.

This milestone is about **presentation, not content**. What the pages say stays largely the same. What changes is how they are organized, how they lead, and how much of the screen they use.

**Goals.**
- Both pages open with a hero that tells a reader in seconds what they're looking at.
- Methodology is organized the way the system runs (fetch, harmonize, model, publish), and a reader can always see where they are.
- Each Methodology section pairs a short paragraph with its evidence (a chart or a compact table), so the page gets shorter and denser.
- About presents the project as a case study: what was built, with what, and the evidence that it's sound. It makes the next step (the source code, LinkedIn) obvious.

**Non-goals.**
- No new data, model changes or pipeline changes.
- No change to the Explorer.
- No new fonts or colours. The brand and tokens from M13 stay as they are.

**Anti-goals.**
- **Marketing voice.** The hero copy states facts plainly. No rhetorical questions ("Can you trust these numbers?"), no superlatives.
- **Hiding the honest numbers.** The weaker regional fit (R² for the Pacific Northwest) is the figure in the hero. It is not swapped for the flattering national one.
- **Losing depth.** Every fact on today's Methodology page is still on the page, reachable by scroll, rail, deep link and Ctrl-F. Folding is allowed. Deleting is not.
- **Breaking links.** Every existing `/methodology#…` anchor keeps working, including links that land inside folded content.
- **Template chrome.** No all-caps eyebrow labels, no decorative numbering, no fade-in on every section. The pipeline's step numbers are allowed because the pipeline really is a sequence.

## Constraints

- Tokens only (`web/src/styles.css`). The raw-value guard (`web/src/test/tokenUsage.test.ts`) covers the new components.
- Contrast and focus rules from `docs/design-system.md` apply in both themes.
- Model copy says "associated with", never "causes". It stays consistent with the methodology page, and that is now the page being redesigned.
- Methodology figures stay data-driven: any number that comes from the exported files today is still read from them, not hard-coded.
- E2E specs import from `./fixtures` and wait on observable conditions. The scrollspy tests must hold up under PR `ci`'s 4× CPU throttle.

## Approaches

The author chose from browser mockups (kept in `.superpowers/brainstorm/`, git-ignored).

**Methodology.** Three directions were mocked up:
- **A · Field guide with a reading rail.** Same single page, with each section's paragraph beside its evidence and a sticky contents rail that tracks your place. Lowest risk. On its own it doesn't change the page enough.
- **B · Pipeline as the table of contents.** Sections are regrouped under four steps (fetch, harmonize, model, export), and a four-step strip at the top serves as both diagram and navigation. It shows engineering thinking at a glance.
- **C · Trust first, then chapters.** A hero framed as "Can you trust these numbers?", then tabbed chapters. Rejected: the author found the copy too on-the-nose, and tabs hide content from Ctrl-F and complicate deep links.

**Chosen:** B's structure with A's reading rail and section layout, under a hero. The two navigation devices merge into one: the pipeline strip is the hero's figure, and the rail repeats the same four steps with each step's sections nested under it. A reader learns the structure once and then sees their place within it.

**About.** Three directions were mocked up:
- **A · Project case study.** A hero, then panels for each part of the system, each with its stack and one piece of evidence.
- **B · Author first.** A pinned author card and a three-part project story. Rejected: it leans on personal copy and puts less weight on the evidence.
- **C · Architecture diagram.** A clickable system diagram as the hero. Rejected: it partly repeats the Methodology pipeline strip.

**Chosen:** A, with a fourth panel for the agent workflow engine (author's call).

**Build approach (author handed this over):** rebuild both pages in the existing React code, reusing the data-driven section components under `web/src/pages/methodology/` and changing how they are arranged. No new dependencies.

## Design

### 1. Methodology

#### 1.1 Hero

- **Heading** (the page's `h2`, which keeps `data-page-heading` and `tabIndex={-1}`): "How the atlas is built".
- **Lede, one sentence:** "Public data for every US county, narrowed to 149 in the Pacific Northwest, and a model tested on states it never saw." The county count comes from the topology, as `AtAGlance` reads it today.
- **Pipeline strip:** four steps in a row, joined by small chevrons. Each step shows a large figure with a short label, then the step name and a one-line description:

  | Step | Figure | Label | Description |
  |---|---|---|---|
  | Fetch | count of public sources | public sources | ACS, CDC PLACES, County Health Rankings, boundaries |
  | Harmonize | county count | counties | Boundary changes, missing and uncertain values |
  | Model | default target's LightGBM PNW R² | R² in the region | 3 outcomes, cross-validated by state |
  | Publish | 5 | data files | Checked against a schema, rebuilt by CI |

  - The source count comes from `manifest.sources`, counting distinct sources. The legacy County Health Rankings vintage is not counted separately, so today the figure is 4.
  - The outcome count in the Model description comes from `model.targets`.
  - The "5 data files" figure may be a constant.
  - Figures use `tabular-nums`.
- **Each step is a link** to its step heading (§1.3). The strip is a list of links inside a `nav` labelled "Pipeline steps". On phones the strip becomes a 2×2 grid.
- **"At a glance" is retired.** Its content is redistributed:
  - The source and county counts move to the strip.
  - The R² pair and the top three factors move to the Model step.
  - The associations sentence moves to the Model step.

#### 1.2 Reading rail

- **Desktop (≥ the breakpoint where the county panel docks, so the site has one desktop breakpoint):** a left column, sticky below the header. It lists the four steps, with their sections nested under each:

  | Step | Sections (existing anchor) |
  |---|---|
  | Fetch | Sources and vintages (`#sources`), Indicators (`#indicators`) |
  | Harmonize | Geography (`#harmonization`), Missing and uncertain values (`#missing-data`), Outcomes by race and ethnicity (`#race-breakdown`) |
  | Model | How it works (`#model`), What it leaves out (`#exclusions`), Similar counties (`#similar-counties`) |
  | Publish | Reproduce it (`#model-card`) |

- **Scrollspy:** the section in view is marked with `aria-current="location"`, an `--evergreen` left rule and bold text. Its step name turns `--evergreen` too. Use an `IntersectionObserver`; don't attach scroll listeners.
- **Clicking an item** moves to the section and focuses its heading, using the existing `useHashFocus` behaviour. Scrolling is smooth unless `prefers-reduced-motion` is set.
- **Rail labels:** the rail may use shorter labels than the section headings ("How it works" rather than "The model"). Each section heading stays a full phrase.
- **Phones:** the rail becomes a slim bar, sticky under the header, reading "Model · How it works" for the current location. Tapping it opens the full list in the existing Popover or Drawer component (builder's call, matching what the site uses at that width). Picking an item closes the list and moves to the section.
- **Accessibility:** the rail is a `nav` labelled "On this page", replacing today's `methodology-toc`. Keyboard order goes hero, then rail, then content.

#### 1.3 Step headings and sections

- **Steps:** each step opens with an `h3` step heading carrying the anchors `#fetch`, `#harmonize`, `#model-step` and `#publish`. (`#model` is already taken by the section, and existing links to it must keep landing on the section.) Beside the heading, in muted text, is "Step 2 of 4". A hairline rule sits under the heading.
- **Sections:** the existing sections become `h4`s under their step. Heading levels shift down one, and the tests that assert on levels are updated.
- **Section layout (desktop):** two columns.
  - **Left:** the section's heading and one or two short paragraphs. The prose measure stays under about 65 characters.
  - **Right:** its evidence, a chart or a compact table in a `--surface` box.
  - **One column:** below the desktop breakpoint, and for any section with no evidence.
- **Folding:** long content folds behind a disclosure using `<details>` with a plain summary such as "Show all 9 factors" or "Show all indicators". Closed `<details>` is found by browser find-in-page, which keeps the "losing depth" anti-goal. These fold:
  - The indicator catalog: it shows a short sample per category and folds the rest.
  - The full factor list in the Model step.
  - Long exclusion lists.

  The builder may fold other long tables by the same rule. Anything a deep link targets (`#legacy`, `#suppression`, `#unreliable`, `#no-result`) must open its enclosing `<details>` before focusing. Extend `useHashFocus` to do this.
- **Model step, "How it works":**
  - **Right column:** the R² comparison as two horizontal bars, national (`--chart-muted`) and Pacific Northwest (`--evergreen`), with the values printed. Below the bars goes one sentence: if the PNW R² is lower, "The region fits less well than the country." The existing conditional from `AtAGlance` carries over.
  - **The full accuracy table** (`MetricsTable`) stays in this section, below the two-column block or folded.
  - **The outcome picker:** stays at the top of the Model step and still drives this step and Reproduce it.
  - **Factors:** the top factors by mean absolute SHAP are drawn as bars in `--chart-muted`, unsigned and not favorability-coloured, because this is global importance, not a direction. They sit beside the sentence "Ranked by how strongly each is associated with the model's estimate. Associations, not causes." The full list is folded.
- **Copy:** each section's opening prose is tightened to fit the two-column layout. Facts are not removed: anything trimmed from the lead paragraph moves below it, or into the fold. Generated sentences stay generated.

### 2. About

#### 2.1 Hero

- **Heading:** "A public health atlas, built end to end".
- **Lede, first person:** "I built this to show how I take public data to a product people can read: the pipeline, the model, the site and the checks around all three." The author may edit the wording.
- **Actions:**
  - "View the source on GitHub" is the page's one `primary` button, linking to the repository.
  - "LinkedIn" is a `secondary` button.
  - Each button carries its icon from `BrandIcons` beside its text.
- **Author line, muted:** "Edward Simpson-Fitzgibbon". No role line (author's call).

#### 2.2 Four panels

A 2×2 grid on desktop and one column on phones. Each panel has:
- a title
- a one-sentence description
- its stack as small chips
- one proof point, set apart with a `--fir-soft` left rule

| Panel | Description | Stack | Proof point |
|---|---|---|---|
| Data pipeline | Fetches, harmonizes and exports county data from four public sources. | Python 3.12, uv, pandas, pytest | Its output is checked against JSON Schemas that the site's types are generated from. |
| Model | Expected values for three outcomes, with factor attributions. | LightGBM, SHAP, ridge baseline | Cross-validated by state, with the weaker regional fit reported on the methodology page. |
| Site and delivery | A map, table and county panel, accessible in both themes. | React 19, TypeScript, Vite, d3-geo, Observable Plot, Playwright | End-to-end and accessibility tests run on every pull request. Changed tests are repeated under 4× CPU throttling to catch flakiness. GitHub Actions deploys the site. |
| Agent workflow | A small engine that runs each milestone as a graph of scripted checks and AI agent steps. | Python, Claude Code, GitHub Actions | Agents can merge only into milestone branches, never `main`. During a run, each merge needs passing gate and review records. |

- The "Model" proof point links to the methodology's Model step (`/methodology#model-step`).
- The "Agent workflow" panel links to `workflow/README.md` on GitHub.
- Copy is final in this spec. The builder may tighten wording but must not add claims.
- Every claim must be true of the repository at the time of the merge. The builder checks each proof point against the code before shipping.

#### 2.3 What else stays and what moves

- **"How to use it":** replaced by one line under the panels: "New to the explorer? Pick a measure, then select a county on the map or in the table." The first sentence links to the Explorer.
- **"Built with":** absorbed into the panels' stack chips.
- **Data credits, the not-affiliated sentence and the license:** a short footer block at the end of the page. The four sources keep their links.
- **"The model shows associations, not causes. It is not medical advice or a forecast.":** stays, as a single muted line in the footer block.

### 3. Shared

- **New components** go under `web/src/pages/` (or `web/src/components/` if both pages use them). Expected: the pipeline strip, the rail with its phone bar, a section layout wrapper, and the About panel. Each uses only tokens.
- **`docs/design-system.md`** gets a short entry for each new component: the rail, the pipeline strip, the two-column section and the panel. Each entry covers when to use the component and which tokens it uses.
- **Retirements:** the `AtAGlance` component and its tests are deleted, and so are the `methodology-toc` styles. No fact is lost (§1.1).
- **Screenshots:** the README or as-built notes get a fresh screenshot of each page, as M13 did for the Explorer.

## Settled after the builder check

Calls marked *(designer's call)* were made while writing the spec, not by the author, and the author can override them.

1. **Evidence per section** *(designer's call)*. Only the Model step gets new charts: the R² bars and the top-factor bars. Every other section moves its existing table, list or `<dl>` into the right-hand box, unchanged in substance. The two-column layout applies when a section has one. Sections with prose only go one column. This keeps M14 a re-layout and avoids new visualisation work.
2. **Hero R² is fixed to the default outcome** *(designer's call)*. The hero states the headline figure and doesn't react to the picker. The Model step and Reproduce it still follow the picker.
3. **One factor element.** The "top three factors" from At a glance and the "Factors by importance" list become one element in the "How it works" section: bars for the top three, with the rest of the ranked list folded behind "Show all N factors". `#model-importance` stays on its heading and keeps working.
4. **Anchored subsections.** Today's `h4` subsections (`#legacy`, `#suppression`, `#unreliable`, `#no-result`, `#model-importance`) become `h5`s and keep their ids. A fold wraps only long tables or lists, never an anchored subsection heading. Where a target still sits inside a `<details>`, `useHashFocus` opens every ancestor `<details>` before focusing.
5. **Scrollspy rule** *(designer's call)*. The current section is the last section whose top has passed a line just below the sticky header plus about a quarter of the viewport. Above the first section, nothing is current. When the page is scrolled to the bottom, the last section is current. A step heading on its own doesn't change the current item.
6. **Clicks set the current item immediately** *(designer's call)*. Clicking a rail or phone-list item marks it current at once, and the observer resumes after the scroll settles. This way a short final section still shows as current, and tests can assert right after the click.
7. **Links.**
   - The repository is `https://github.com/edward-sf/pnw-health-dashboard`, default branch `main`. The workflow link goes to `blob/main/workflow/README.md`.
   - LinkedIn is `https://www.linkedin.com/in/edward-sf`, as today.
   - The stack chips were checked against `pipeline/pyproject.toml` and `web/package.json`. The ridge baseline is in `pipeline/src/pnw_health/model/cv.py`.
8. **Work split.** Every issue PR keeps `ci` green on its own. The heading-level shift lands in the same PR as the step headings and section layout, not on its own.

## Testing

- **Unit tests (Vitest):**
  - The hero figures come from the data (source count, county count, PNW R²), including when PNW R² ≥ national.
  - The rail lists every section under the right step.
  - `aria-current` moves when a mocked `IntersectionObserver` fires.
  - `useHashFocus` opens an enclosing `<details>`.
  - The About panels render with their links.
  - Existing section tests are updated for the new heading levels.
- **E2E (Playwright), all through `./fixtures`:**
  - `a11y.spec.ts`: axe passes on both pages in both themes, including at phone width.
  - `smoke.spec.ts`: both pages render. `methodology#no-result` lands on its target with the enclosing fold open.
  - **New, scrollspy:** scrolling to the Model step marks "How it works" as current. Wait on the `aria-current` attribute, not on a timeout.
  - **New, phone bar:** at phone width the bar shows the current location and its list navigates.
  - **New, deep links:** every inbound anchor the Explorer uses (`#legacy`, `#suppression`, `#unreliable`, `#no-result`, `#similar-counties`) lands on a visible, focused target.
- **`pages404.spec.ts`:** the `methodology?i=…#sources` redirect still works.

## Left to the builder

- The exact breakpoint behaviour, provided it reuses the site's existing desktop breakpoint.
- Popover or Drawer for the phone list.
- Which further tables fold, by the "long content" rule.
- Visual details within the tokens: spacing, chip style, chevrons in the strip, bar heights.
- How to split the work into issues and PRs, in the plan.

## As built

Where the implementation differs from the spec above, or where the spec left a choice open:

- **Pipeline strip bullets.** The strip briefly showed list bullets, because the `.methodology ul` rule outranked the strip's `list-style: none`. Fixed in the final-review batch by scoping the strip's rules under `.methodology`.
- **Reading line.** The scrollspy first watched a zero-height line, so a jump that carried a heading across it in one frame left the rail on a stale item, and rail clicks, hero clicks and deep links were all affected. Fixed in the final-review batch: it observes the band from the viewport top to the line, recomputes `current` from the headings' positions on every callback and when a pin ends, and `useHashFocus` focuses with `preventScroll` so smooth scrolling is not cancelled. The e2e tests click each rail item and assert the settled item.
- **Sticky offsets.** The site header is not sticky. The phone bar sticks at the top edge, the desktop rail 1rem down, and headings carry a phone `scroll-margin-top` for the bar.
- **`#model-importance` focus.** The heading gained `tabIndex={-1}` in this task so a deep link can focus it, as the spec's deep-link rule requires. The spec listed it among the anchors that keep working but did not say it must be focusable.
- **Lead copy.** The two-column sections' lead prose was tightened after the final review (#358), not in #352 as its description first said. Model's paragraph on why CDC PLACES outcomes and low birth weight aren't targets moved below the split, under "Outcomes left out". No fact was removed.
- **States named.** Removing At a glance took the four state names off the page. The Geography section's opening now names them and the county count, both read from the topology (#358).
- **Content width.** The methodology and About pages share the site's content column, so at 1440 wide they stop near 1040px and leave the right side empty. The spec did not set a width.
- **About proof points.** The Model and Agent workflow proof points are links as a whole sentence (the spec says the panel links to its target without fixing the link's extent).
- **Stack chips.** Site and delivery lists React 19, TypeScript, Vite, d3-geo, Observable Plot and Playwright, as the spec does.
- **Screenshots.** Light theme, 1440 wide, taken from a production build: `docs/images/methodology.png` and `docs/images/about.png`, shown in the README.
