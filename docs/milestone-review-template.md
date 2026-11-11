# Milestone Review Template

Use this when reviewing a milestone PR (`milestone/m<N> → main`). Copy everything below the line into a scratch file, fill it in as you go, and submit it as the PR review body:

```bash
gh pr review <PR#> --approve --body-file review.md          # or --request-changes / --comment
```

Each issue PR was already checked against its plan task. This review is about the **slice as a whole**: does it do what the milestone promised, does it match the spec, and is it safe to put on `main`?

**Suggested order:** sections 1–3 take about 15 minutes and tell you whether a deep read is worth it. If section 3 fails, stop and request changes.

---

## Milestone review: M<N> <name>

**PR:** #<PR#> · **Reviewed at commit:** `<sha>` · **Date:** <YYYY-MM-DD>

### 1. Scope and exit criteria
- [ ] Every exit criterion in the roadmap for this milestone is met, with evidence in the PR (not just a ticked box)
- [ ] The "Issue PRs" list matches the milestone's issues on the board, and every issue has a `Closes #` line
- [ ] Nothing out of scope slipped in (later-milestone work, spec §10 Future work, unrelated refactors)

Notes:

### 2. Spec alignment and decisions
- [ ] Every item under "Deviations from plan/spec" is acceptable to me
- [ ] Where a deviation changed *what* we build, the spec was updated in this milestone
- [ ] The rulings the implementer made on my behalf are ones I agree with (check each "cost if wrong")
- [ ] Wording and framing follow the spec, e.g. "factors associated with", never causal language (M4+)

Rulings I'd overturn or want discussed:

### 3. Reproduce the verification myself
Run these on the milestone branch (`git switch milestone/m<N> && git pull`):

```bash
cd pipeline && uv sync && uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src
cd pipeline && uv run pnw-health run --root ..          # live run; needs CENSUS_API_KEY in .env
cd web && npm ci && npm test && npm run lint && npm run typecheck && npm run build   # from M2
```

- [ ] Tests, lint, format and types pass locally, with the same counts as the PR states
- [ ] The live pipeline run succeeds
- [ ] Spot check: I looked at 2–3 real values I can sanity-check (e.g. my own county, an Alaska borough, a known outlier)
- [ ] From M2: the site builds, and I clicked through the deployed or preview site

Results:

### 4. Code walkthrough (follow the PR's "Review guide")
**Correctness**
- [ ] The riskiest logic named in the review guide does what its docstring and tests claim
- [ ] Edge cases from the plan's Review Focus are each covered by a test I can point to

**Data integrity** *(the things that silently produce wrong numbers)*
- [ ] FIPS stay 5-character strings end to end (watch Alaska `02…`)
- [ ] Missing or suppressed values stay null; nothing is imputed for display
- [ ] Alaska geography rules hold (Kusilvak rename, Valdez-Cordova legacy handling)
- [ ] Units, directions and CIs are right for any new indicators

**Contract** *(what the other half of the system depends on)*
- [ ] Any change to `schema/*.json` is intentional, and `SCHEMA_VERSION` was bumped if a change breaks consumers
- [ ] Pipeline and web agree on the shape (from M2: the generated TS types compile against real exports)

**Failure behavior**
- [ ] Failures give a clear message and a non-zero exit, not a traceback or a silent partial result
- [ ] Nothing is written or deployed after a failed validation

**Readability**
- [ ] I could explain each new module's purpose in one sentence, and none is doing several jobs

Findings (file:line — what — severity):

### 5. Tests
- [ ] The tests check behavior, not mocks of our own code
- [ ] No test hits the network
- [ ] Fixtures are real recorded responses (or clearly synthetic) and contain no secrets

### 6. Security and repo hygiene
- [ ] No secrets in the diff, fixtures, logs or PR text (`git log -p origin/main..HEAD | grep -i key` is a quick check)
- [ ] No raw or exported data committed (`data/`, `web/public/data/`)
- [ ] New dependencies are justified and pinned in the lockfile

### 7. Deferred items
- [ ] I accept each "Deferred minor", or I've moved it into this milestone
- [ ] Each accepted deferral has a Backlog issue (otherwise it's forgotten once this PR merges)

Deferrals I'm pulling back in:

### 8. Milestone-specific checks
*Delete the sections that don't apply.*

**M2 Map + live site**

*Before merge:*
- [ ] `build-deploy` ran green on `milestone/m2`: real pipeline, site build and Playwright smoke test, with the deploy job skipped
- [ ] On a local production build, the map shows all 149 counties with Alaska drawn as an inset
- [ ] Indicator picker, URL state and bad-param fallback all work by hand
- [ ] `ci` is required on `main`

*After merge (a failure here gets a hotfix):*
- [ ] A manual `build-deploy` run on `main` deployed successfully
- [ ] The public URL loads and shows all 149 counties, and reloading `/methodology` works
- [ ] The monthly cron is configured on `main` (its first scheduled run need not have happened yet)

**M3 Full data + county panel**
- [ ] Each new source's suppression and missing values show as "not available", not as zero
- [ ] The legacy Valdez-Cordova message shows on Chugach and Copper River for measures CHR 2025 leaves blank and CHR 2023 reports
- [ ] "Who lives here" is visually and textually separate from any model content

**M4 ML pipeline: checkpoint (closes the `checkpoint` issue)**
- [ ] National and PNW metrics for ridge, LightGBM and the behaviors comparison are reasonable, and LightGBM beats ridge by a margin worth the complexity
- [ ] The flag distribution is plausible: roughly 10% outside the 90% range, more for 75%, and not dominated by tiny counties
- [ ] SHAP for 3–5 counties I know makes sense, and no feature dominates suspiciously (a sign of leakage)
- [ ] Excluded features (behaviors, race/ethnicity) really are absent from the main model
- [ ] **Decision:** proceed to M5 as designed / revise the ML design first

**M5 Model UI**
- [ ] Copy says "factors associated with", and flags show their 75%/90% ranges
- [ ] Model mode is understandable to someone who hasn't read the spec

**M6 Methodology + polish**
- [ ] The methodology page covers sources, vintages, harmonization, the ML method, exclusion rationale and caveats
- [ ] README has a live link, screenshot and badges; mobile and accessibility passes done

### 9. Verdict
- [ ] **Approve.** Merge with a **merge commit** (not squash).
- [ ] **Approve with follow-ups.** Merge now; follow-up issues filed: #…
- [ ] **Request changes.** Blocking items: …

Summary (2–3 sentences, for the PR record):
