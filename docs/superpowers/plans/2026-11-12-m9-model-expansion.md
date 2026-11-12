# M9 Model Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The model predicts four CHR outcomes instead of one, model mode gets an Outcome picker (`t`), and every PNW county shows its five most similar PNW counties.

**Architecture:** `model.json` becomes `{targets: {id: TargetModel}, peers}`. The pipeline loops its existing CV, flag and SHAP steps over `TARGETS`, with direction-aware flag signs. A new `model/peers.py` computes nearest neighbours once. The web reads the target from a new `t` URL param through one helper, so no model UI code hardcodes life expectancy.

**Tech Stack:** Python 3.12, pandas, LightGBM, Pydantic, pytest (pipeline); Vite, React, TypeScript, Vitest, Testing Library, Playwright (web).

**Spec:** `docs/superpowers/specs/2026-11-12-m9-model-expansion-design.md`. Read it with this plan; section references (§) point there.

## Global Constraints

- `TARGETS = ("life_expectancy", "premature_death", "injury_deaths", "low_birth_weight")`; the first is the default everywhere.
- `SCHEMA_VERSION = "2.0.0"`.
- `PEER_K = 5`, `PEER_MIN_FEATURES = 6`; peer features are the model's `FEATURES`.
- Residual is always `actual − predicted`; a negative residual is better for `higher_is_worse` targets.
- Copy uses "factors associated with", never causal wording; peer and flag wording are never linked.
- Exact copy pinned by the spec: "Higher is worse for this measure, so a positive difference means worse than expected." / "Most similar PNW counties on income, poverty, education and six other social and economic measures." / "Not enough data to find similar counties."
- Issue branches are cut from `milestone/m9`; PRs target `milestone/m9`, titles are Conventional Commits, bodies say `Part of #<n>` (CONTRIBUTING).
- After any contract change: `cd pipeline && uv run pnw-health schema --root ..`, and commit `schema/`.
- No task after T4 starts until the author closes the T4 checkpoint issue.

## Review Focus

1. **A target with no usable CIs.** `sigma_model_sq` raises "no standard errors" with no hint of which target. Expected: the error names the target. Test in Task 1.
2. **A feature constant across the PNW** (zero standard deviation). Expected: z-scores don't divide by zero; the feature contributes 0 to every distance. Test in Task 3.
3. **Peers with null values for the current indicator.** Expected: "Not available" per peer; the median uses only non-null peers; with none, the median row shows "Not available". Test in Task 8.
4. **A county with `insufficient_data` for the chosen target but not for others.** Expected: the card names the chosen target ("…because its premature death isn't reported"), not life expectancy. Test in Task 6.
5. **Changing the outcome with a county selected, then switching modes.** Expected: `c` and `i` survive an outcome change, and `t` survives a switch to values mode and back. Test in Task 5.

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `pipeline/src/pnw_health/model/config.py` | `TARGETS`, `PEER_K`, `PEER_MIN_FEATURES` | 1, 3 |
| `pipeline/src/pnw_health/model/features.py` | `check_targets`; `build_table` takes a required `target` | 1 |
| `pipeline/src/pnw_health/model/run.py` | Loop over targets; build `TargetModel`; call peers | 1, 3 |
| `pipeline/src/pnw_health/model/flags.py` | `classify(..., direction)` | 2 |
| `pipeline/src/pnw_health/model/peers.py` (new) | Nearest-neighbour peers | 3 |
| `pipeline/src/pnw_health/contract.py` | `TargetModel`, `PeerMethod`, `Peers`, new `ModelFile` | 1, 3 |
| `pipeline/src/pnw_health/validate.py` | Per-target and peer checks | 1, 3 |
| `pipeline/src/pnw_health/export.py`, `cli.py`, `config.py` | Per-target finalize/echo; schema version | 1 |
| `pipeline/scripts/model_report.py` | Report every target | 1 |
| `pipeline/tests/model/synthetic.py` | Synthetic data for every target | 1 |
| `web/src/model/targetView.ts` (new) | `targetModel`, `directionNote` | 1, 6 |
| `web/src/explorer/parseParams.ts`, `useExplorerParams.ts` | `t` param | 5 |
| `web/src/explorer/OutcomePicker.tsx` (new) | Outcome select | 5 |
| `web/src/panel/SimilarCounties.tsx` + `buildPeerRows.ts` (new) | Similar counties section | 8 |
| `web/src/pages/methodology/*` | Per-target tables, target select, new text | 7 |
| `web/e2e/smoke.spec.ts` | Outcome and peer steps | 9 |

---

### Task 1: Multi-target pipeline and contract (#45)

**Files:**
- Modify: `pipeline/src/pnw_health/model/config.py`, `model/features.py`, `model/run.py`, `contract.py`, `validate.py`, `export.py`, `cli.py`, `config.py`, `pipeline/scripts/model_report.py`
- Modify: `pipeline/tests/model/synthetic.py`, `tests/model/test_run.py`, `tests/model/test_features.py`, `tests/test_validate.py`, `tests/test_export.py`, `tests/test_model_report.py`, `tests/test_contract.py`
- Modify: `schema/model.schema.json` (regenerated)
- Create: `web/src/model/targetView.ts`, `web/src/model/targetView.test.ts`
- Modify: `web/src/types/index.ts`, `web/src/test/fixtures/model.ts`, every consumer of `ModelFile` (`Explorer.tsx`, `modelView.ts`, `pages/methodology/*.tsx`, `pages/methodology/format.ts`)
- Docs: parent spec §4 and §5 (spec §5 table)

**Interfaces:**
- Produces (pipeline):
  - `config.TARGETS: tuple[str, ...]`; `TARGET` is removed.
  - `features.check_targets(targets: Sequence[str], catalog: list[Indicator]) -> None`, which raises `ModelDataError`.
  - `features.build_table(long, features=FEATURES, behaviors=BEHAVIORS, *, target: str) -> ModelTable` (target required).
  - `contract.TargetModel(label: str, unit: Unit, direction: Literal["higher_is_better", "higher_is_worse"], metrics, behaviors_comparison, global_importance, thresholds, counties, model_card)`.
  - `contract.ModelFile(targets: dict[str, TargetModel])`. Task 3 adds `peers`.
  - `run.run_target(long: pd.DataFrame, target: Indicator) -> TargetModel`; `run_model(long, catalog) -> ModelFile`.
  - `synthetic.make_long(..., targets: Sequence[str] = TARGETS)`.
- Produces (web):
  - `type TargetModel` exported from `src/types`.
  - `DEFAULT_TARGET = "life_expectancy"` and `targetModel(model: ModelFile, id: string): TargetModel` in `src/model/targetView.ts`. It throws `Error("unknown target <id>")` for a missing key; callers pass only validated ids.
  - `countyModel`, `tierCounts` and the methodology sections take a `TargetModel` where they took a `ModelFile`.

- [ ] **Step 0: Save the baseline.** Before changing anything, copy the current `web/public/data/model.json` (from a run on `main`) to the scratchpad as `model.before.json`.

- [ ] **Step 1: Extend the synthetic data.** `make_long` emits each id in `targets` as a target, each linear in the features with its own intercept (`78.0, 7000.0, 80.0, 7.0` in `TARGETS` order) and `ci_low/ci_high = value ∓ 1.0`, source `chr`.

- [ ] **Step 2: Write failing pipeline tests**

```python
# tests/model/test_features.py
def test_check_targets_accepts_the_configured_targets(catalog): check_targets(TARGETS, catalog)
def test_check_targets_rejects_unknown_id(catalog):            # match "'nope' is not in the indicator catalog"
def test_check_targets_rejects_non_outcome(catalog):           # "poverty_rate" -> match "category"
def test_check_targets_rejects_missing_ci_level(catalog):      # catalog copy with ci_level=None -> match "ci_level"
def test_check_targets_rejects_neutral(catalog):               # catalog copy with direction="neutral" -> match "neutral"

# tests/model/test_run.py  (module fixture `model` = run_model(make_long(), catalog))
def test_targets_in_config_order(model): assert list(model.targets) == list(TARGETS)
def test_target_carries_catalog_label_unit_direction(model, catalog):
    pd_ = model.targets["premature_death"]
    assert (pd_.label, pd_.unit, pd_.direction) == ("Premature death (years lost)", "rate_per_100k", "higher_is_worse")
def test_card_target_matches_key(model): assert all(t.model_card.target == k for k, t in model.targets.items())
def test_training_counts_differ_when_a_target_is_sparser(long, catalog):
    # null out injury_deaths for one state -> its training_counties is smaller than life_expectancy's
def test_target_without_cis_names_the_target(long, catalog):   # Review Focus 1
    # set ci_low/ci_high NaN for every premature_death row -> ModelDataError match "premature_death"
```

Rewrite the existing `test_run.py` tests to read `model.targets["life_expectancy"]` in place of `model`. Their assertions don't change.

```python
# tests/test_validate.py
def test_validate_model_prefixes_problems_with_target(...):
    # break additivity in targets["injury_deaths"] only -> DataValidationError whose problems
    # contain exactly one entry, starting "injury_deaths: model contributions do not sum"
```

- [ ] **Step 3: Run and confirm they fail.** `cd pipeline && uv run pytest tests/model tests/test_validate.py -q` should FAIL with import errors (`TARGETS`, `check_targets`, `TargetModel`).

- [ ] **Step 4: Implement.**
  - `check_targets` follows `check_features`. Rule order: in the catalog → `category == "Outcomes"` → `ci_level is not None` → `direction != "neutral"`.
  - `run_target` is today's `run_model` body for one target. Wrap the steps from `build_table` through `classify` in `try/except ModelDataError as err: raise ModelDataError(f"{target.id}: {err}") from err`.
  - `run_model` calls `check_features`, then `check_targets`, then `run_target` for each id in `TARGETS`.
  - `validate_model` moves today's body into `_validate_target(target_id, target, values, county_fips, catalog) -> list[str]`, using `target_id` in place of `TARGET`. It prefixes each problem with `f"{target_id}: "` and raises once with all problems.
  - `finalize_model` trims and rounds the counties of each target.
  - `cli._model` echoes the dropped-county count once per target: `model: life_expectancy: 3 dropped county(ies)…`.
  - `model_report.main` writes every section once per target, under a `## <label>` heading.
  - `SCHEMA_VERSION = "2.0.0"`. Regenerate `schema/`.

- [ ] **Step 5: Run the pipeline checks.** `cd pipeline && uv run pytest -q && uv run ruff check && uv run ruff format --check && uv run mypy src` should all PASS. That includes `test_contract.py`'s schema-drift test after regeneration.

- [ ] **Step 6: Update the web for the new shape.**
  - Write `targetView.test.ts` first: `targetModel(model, "life_expectancy")` returns the fixture entry, and an unknown id throws.
  - Move the fixture's current body under `targets.life_expectancy`, with `label: "Life expectancy"`, `unit: "years"`, `direction: "higher_is_better"`.
  - In `Explorer.tsx` and on the methodology page, pass `targetModel(model, DEFAULT_TARGET)` wherever `model` went.
  - Run `cd web && npm test && npm run lint && npm run typecheck`. All three should PASS, with no rendered output changed.

- [ ] **Step 7: Prove life expectancy is unchanged.** Step 0 saved `model.before.json`. Now run `cd pipeline && uv run pnw-health run --stage model && uv run pnw-health run --stage export`. Then this command should print nothing:

```bash
diff <(jq -S . model.before.json) <(jq -S '.targets.life_expectancy | del(.label, .unit, .direction)' web/public/data/model.json)
```

- [ ] **Step 8: Update the docs and commit.** Edit parent spec §4 and §5 as in spec §5. Commit as `feat(ml): model every configured target`.

---

### Task 2: Direction-aware flags

**Files:** Modify `pipeline/src/pnw_health/model/flags.py`, `model/run.py`, `tests/model/test_flags.py`, `tests/model/test_run.py`; parent spec §5.

**Interfaces:**
- Consumes: `TargetModel.direction` (Task 1).
- Produces: `classify(residuals, se, sigma_sq, mean_se_sq, direction: Literal["higher_is_better", "higher_is_worse"]) -> Flags`. No default, so every caller has to choose.

- [ ] **Step 1: Write failing tests.** Parametrize the existing `test_tiers` and `test_exactly_on_threshold_is_lower_tier` over both directions.

```python
@pytest.mark.parametrize("direction, sign", [("higher_is_better", 1), ("higher_is_worse", -1)])
def test_tiers(direction, sign):
    # same residuals as today multiplied by `sign`; expected flags identical to today's list
def test_higher_is_worse_positive_residual_is_worse():
    # residual +10 with threshold ~1 -> "notably_worse"
def test_run_flags_follow_direction(long, catalog):
    # in run_model output, every premature_death county with residual < -threshold_90 is "notably_better"
```

- [ ] **Step 2: Run and confirm they fail.** `uv run pytest tests/model/test_flags.py -q` should FAIL with `TypeError: classify() got an unexpected keyword argument 'direction'`.

- [ ] **Step 3: Implement.** `better = residuals > 0` if `direction == "higher_is_better"`, otherwise `residuals < 0`. `run_target` passes `target.direction`. Update the module docstring's "positive residual" sentence.

- [ ] **Step 4: Run all pipeline checks; they should PASS.** Re-run Task 1 Step 7's diff; it should still print nothing.

- [ ] **Step 5: Update the docs and commit.** Edit parent spec §5 so the flag sign is direction-aware. Commit as `feat(ml): direction-aware flag signs`.

---

### Task 3: Peer counties in the pipeline (#43)

**Files:**
- Create: `pipeline/src/pnw_health/model/peers.py`, `pipeline/tests/model/test_peers.py`
- Modify: `model/config.py`, `model/run.py`, `contract.py`, `validate.py`, `tests/test_validate.py`, `schema/model.schema.json`, `web/src/test/fixtures/model.ts`, `web/src/types/index.ts`
- Docs: parent spec §4 and §10

**Interfaces:**
- Produces:
  - `config.PEER_K = 5`, `config.PEER_MIN_FEATURES = 6`.
  - `peers.find_peers(table: pd.DataFrame, k: int = PEER_K, min_features: int = PEER_MIN_FEATURES) -> dict[str, list[str]]`. `table` is indexed by FIPS (PNW counties only) with one column per feature. Every index FIPS is a key, in sorted order.
  - `contract.PeerMethod(features: list[str], k: int, min_features: int)`; `contract.Peers(method: PeerMethod, counties: dict[str, list[str]])`; `ModelFile.peers: Peers`.
  - `run_model` builds `table` from the PNW rows of `long` (FIPS where `state_abbr` is not None), pivoted to `FEATURES`, with every PNW FIPS present in the index.
  - Web: `type Peers` exported from `src/types`; the fixture gains `peers` for its counties.

- [ ] **Step 1: Write failing tests** in `test_peers.py`, on small hand-built tables (k=2 where noted).

```python
def test_nearest_first_on_hand_computed_distances():
    # one feature column, values A=0, B=1, C=3, D=10 (min_features=1, k=2)
    # -> A: [B, C]; D: [C, B]
def test_ties_broken_by_fips():                  # B and C equidistant from A -> lower FIPS first
def test_never_lists_itself_and_no_duplicates():
def test_too_few_features_gets_no_peers_and_is_not_a_peer():
    # county E has 5 of 9 features -> peers["E"] == [] and E in no other list
def test_missing_feature_filled_with_pnw_median_before_scaling():
    # county with one NaN feature equals the median -> same distances as if it held the median
def test_constant_feature_contributes_nothing():  # Review Focus 2: no NaN, same result as dropping it
def test_deterministic():                        # shuffled row order -> identical dict
```

```python
# tests/test_validate.py
def test_peer_outside_pnw_rejected(...)      # match "peer"
def test_peer_lists_itself_rejected(...)
def test_peer_list_duplicate_rejected(...)
def test_peer_list_wrong_length_rejected(...)  # 3 entries with k=5
def test_peers_missing_a_county_rejected(...)
```

- [ ] **Step 2: Run and confirm they fail.** `uv run pytest tests/model/test_peers.py tests/test_validate.py -q` should FAIL on the import of `find_peers`.

- [ ] **Step 3: Implement `find_peers`.** Use this order:
  1. Mark the eligible counties: those with at least `min_features` non-null features.
  2. Fill NaN with the column median over the eligible counties.
  3. Z-score each column over the eligible counties; a column with zero std becomes 0.
  4. Compute pairwise Euclidean distances with numpy.
  5. For each eligible county, sort the other eligible counties by `(distance, fips)` and take the first `k`.
  6. Ineligible counties map to `[]`.

  In `validate.py`, add `_peer_problems(peers, county_fips) -> list[str]` covering each rule in spec §3.2, and call it from `validate_model`. Regenerate `schema/`.

- [ ] **Step 4: Run all pipeline checks and the web checks.** Both should PASS once the web fixture has `peers`.

- [ ] **Step 5: Update the docs and commit.** Edit parent spec §4 and remove the peers line from §10. Commit as `feat(ml): nearest-neighbour peer counties`.

---

### Task 4: Checkpoint — per-target model review

Not code. Create the issue with the `checkpoint` label.

- [ ] **Step 1: Run the pipeline and the report.** `cd pipeline && uv run pnw-health run --stage model && uv run python scripts/model_report.py > ../review-m9-checkpoint.md`. Don't commit the output.
- [ ] **Step 2:** Post a summary on the issue: national and PNW R² and RMSE per target, flag counts per target, two SHAP samples per target, and five sample peer lists with county names.
- [ ] **Step 3: Wait for the author** to close the issue. If they drop a target, remove it from `TARGETS`, record the decision under a new "Checkpoint outcome" heading in spec §2.5, and commit as `docs(spec): M9 checkpoint outcome`. Also update the synthetic intercepts and the tests that name that target.

---

### Task 5: `t` param and Outcome picker

**Files:**
- Modify: `web/src/explorer/parseParams.ts`, `parseParams.test.ts`, `useExplorerParams.ts`, `useExplorerParams.test.tsx`, `Explorer.tsx`, `Explorer.test.tsx`
- Create: `web/src/explorer/OutcomePicker.tsx`, `OutcomePicker.test.tsx`
- Docs: parent spec §6 Routes and §6 Explorer

**Interfaces:**
- Consumes: `DEFAULT_TARGET`, `targetModel` (Task 1).
- Produces:
  - `ParamKey` gains `"t"`; `ExplorerParams.target: string`.
  - `parseParams(search, manifest, fipsSet, targetIds: readonly string[])`. `targetIds` is `Object.keys(model.targets)`, and the default is `targetIds[0]`.
  - `useExplorerParams(manifest, fipsSet, targetIds)` returns `setTarget(id: string)`. Setting the default deletes `t`; any other value sets it.
  - `OutcomePicker({ targets: {id: string; label: string}[], value: string, onChange: (id: string) => void })`: a labelled native select, with accessible name "Outcome".

- [ ] **Step 1: Write failing tests.**

```ts
// parseParams.test.ts
it("defaults t to the first target", ...)            // target === "life_expectancy", invalid []
it("accepts a known t", ...)                          // "?t=injury_deaths"
it("flags an unknown t", ...)                         // "?t=nope" -> default, invalid ["t"]
// useExplorerParams.test.tsx
it("setTarget keeps c and i", ...)                    // Review Focus 5
it("t survives a switch to values mode and back", ...)
it("setTarget to the default removes t", ...)
// Explorer.test.tsx
it("shows the Outcome select in model mode instead of the indicator picker", ...)
it("hides the Outcome select in values mode", ...)
```

- [ ] **Step 2: Run and confirm they fail.** `cd web && npx vitest run src/explorer` should FAIL.
- [ ] **Step 3: Implement.** In model mode, `Explorer` renders `OutcomePicker` where the dimmed `IndicatorPicker` was, and deletes the model-mode note from `IndicatorPicker`. The Explorer passes `targetModel(model, params.target)` everywhere Task 1 passed `DEFAULT_TARGET`.
- [ ] **Step 4: Run the web checks; all should PASS.** Edit parent spec §6 Routes and §6 Explorer (Outcome picker). Commit as `feat(web): outcome picker in model mode`.

---

### Task 6: Target-aware model UI

**Files:** Modify `web/src/model/targetView.ts` (+test), `modelView.ts`, `buildShapBars.ts`, `panel/ModelCard.tsx`, `panel/ResidualRange.tsx`, `table/ModelTable.tsx`, `explorer/Explorer.tsx`, and each component's test. Add a second target to `test/fixtures/model.ts`: `premature_death`, `rate_per_100k`, `higher_is_worse`, with one county `insufficient_data` there but not under `life_expectancy`.

**Interfaces:**
- Consumes: `TargetModel` (Task 1), `params.target` (Task 5).
- Produces:
  - `directionNote(target: TargetModel): string | null`. It returns the spec's exact sentence for `higher_is_worse`, otherwise `null`.
  - `ModelCard`, `ResidualRange`, `ModelTable`, `buildShapBars` and `modelTooltip` take `target: TargetModel`, or `unit` where only the unit is used, in place of their hardcoded `"years"`.

- [ ] **Step 1: Write failing tests.**

```ts
it("titles the map from the target", ...)             // "Premature death (years lost): compared with expected"
it("heads the card with the target label", ...)       // heading "Premature death (years lost) model"
it("formats actual and expected in the target unit", ...)  // no "years" in the card for premature_death
it("adds the direction note for higher_is_worse", ...) // exact sentence present; absent for life_expectancy
it("names the chosen target when the county has no result", ...)  // Review Focus 4
it("labels model table columns from the target", ...)
```

- [ ] **Step 2: Run them and confirm they FAIL.**
- [ ] **Step 3: Implement.** Make sure nothing hardcoded is left:

```bash
grep -rniE 'life expectancy|"years"' web/src --include='*.ts' --include='*.tsx' | grep -v test | grep -v generated | grep -v color/formatValue | grep -v StripPlot | grep -v pages/
```

  This should print nothing. The methodology pages are covered by Task 7.
- [ ] **Step 4: Run the web checks; all should PASS.** Commit as `feat(web): target-aware model UI`.

---

### Task 7: Methodology updates

**Files:** Modify `web/src/pages/methodology/ModelSection.tsx`, `MetricsTable.tsx`, `ExclusionsSection.tsx`, `AtAGlance.tsx`, `ReproducibilitySection.tsx`, `pages/Methodology.tsx`, and their tests. Create `pages/methodology/PeersSection.tsx` (+test).

**Interfaces:**
- Consumes: `ModelFile.targets`, `ModelFile.peers`.
- Produces: `Methodology` holds `const [targetId, setTargetId] = useState(DEFAULT_TARGET)`, local to the page and not in the URL. It feeds the global-importance and model-card details.

- [ ] **Step 1: Write failing tests.**
  - The metrics table has one row per target and model: 4 targets × 2 models when the fixture has 4. Use the fixture's count.
  - The behaviors comparison has one row per target.
  - Changing the page's target select changes the importance list heading.
  - The text includes the PLACES-circularity sentence and the direction sentence.
  - `PeersSection` names k = 5, the minimum of 6 of 9 features, median imputation, and the race and ethnicity exclusion.
  - Its heading has the id the panel links to: `similar-counties`.
- [ ] **Step 2: Run them and confirm they FAIL.**
- [ ] **Step 3: Implement.** Write the copy in the existing methodology voice. Spec §2.8 and §3.4 fix the content.
- [ ] **Step 4: Run the web checks; all should PASS.** Commit as `feat(web): methodology for every target and similar counties`.

---

### Task 8: Similar counties panel section

**Files:** Create `web/src/panel/buildPeerRows.ts` (+test) and `web/src/panel/SimilarCounties.tsx` (+test). Modify `panel/CountyPanel.tsx` (+test) and `explorer/Explorer.tsx`. Docs: parent spec §6 Explorer.

**Interfaces:**
- Consumes: `ModelFile.peers` (Task 3), `targetModel` (Task 1), `setCounty` (existing).
- Produces:
  - `type PeerRow = { fips: string; name: string; isSelected: boolean; value: number | null; expected?: number | null; flag?: Flag }`.
  - `buildPeerRows(fips: string, peers: Peers, counties: County[], source: {kind: "values"; entries: Record<string, ValueEntry>} | {kind: "model"; target: TargetModel}): { rows: PeerRow[]; median: { value: number | null; expected?: number | null } } | null`. It returns `null` when the county has no peers. The median uses only peer rows (not the selected county) with non-null values.
  - `SimilarCounties({ rows, median, unit, mode, onSelect: (fips: string) => void })`.

- [ ] **Step 1: Write failing tests.**

```ts
// buildPeerRows.test.ts
it("puts the selected county first, then peers nearest first", ...)
it("median ignores null peers", ...)                       // Review Focus 3
it("median is null when every peer is null", ...)
it("model source carries expected and flag", ...)
it("returns null for a county with no peers", ...)
// SimilarCounties.test.tsx
it("shows 'Not available' for a null value", ...)
it("model mode shows actual, expected and flag; median row has no flag", ...)
it("clicking a peer calls onSelect with its fips", ...)
it("shows the basis sentence with a link to /methodology#similar-counties", ...)
// CountyPanel.test.tsx
it("renders Similar counties after Who lives here in both modes", ...)
it("shows 'Not enough data to find similar counties.' when there are no peers", ...)
```

- [ ] **Step 2: Run them and confirm they FAIL.**
- [ ] **Step 3: Implement.** A peer button calls the same `setCounty` as a map click. The section is a `<section aria-labelledby>` with heading "Similar counties". Its copy never mentions the flag.
- [ ] **Step 4: Run the web checks; all should PASS.** Edit parent spec §6 Explorer (panel order). Commit as `feat(web): similar counties in the county panel`.

---

### Task 9: Playwright smoke test

**Files:** Modify `web/e2e/smoke.spec.ts`.

- [ ] **Step 1: Add tests.**

```ts
test("model mode: change the outcome", async ({ page }) => {
  // goto "./?mode=model&c=53033"; select "Premature death (years lost)" in combobox "Outcome"
  // expect URL /[?&]t=premature_death/ and /[?&]c=53033/; heading contains "Premature death"
});
test("select a similar county", async ({ page }) => {
  // goto "./?c=53033"; click the first button in region "Similar counties" other than the selected
  // county; expect URL c= to change to that button's county; panel heading shows its name
});
```

- [ ] **Step 2: Run them.** `cd web && npm run build && CI=1 npx playwright test` should PASS: the smoke, a11y, mobile and pages404 projects.
- [ ] **Step 3: Commit** as `test(web): smoke steps for outcome picker and similar counties`.

---

## Milestone wrap-up (after T9)

Run every check on `milestone/m9`: both pipeline and web suites, plus `CI=1` Playwright. Then fill in the milestone PR with every issue PR, a `Closes #…` line per issue, and verification evidence, including the Task 1 Step 7 diff result. Mark it ready for the author, and watch `build-deploy` on the milestone push.
