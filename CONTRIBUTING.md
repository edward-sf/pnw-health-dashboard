# Development Workflow

How work is planned, tracked, and merged in this repo. These rules apply to every contributor, human or AI.

## Planning artifacts

| Artifact | Lives in | Purpose |
|---|---|---|
| Design spec | `docs/superpowers/specs/` | *What* we build and why. Source of truth for requirements. |
| Roadmap | `docs/superpowers/plans/*-roadmap.md` | Milestones and their issues. |
| Milestone plan | `docs/superpowers/plans/*-m<N>-*.md` | *How* each issue is implemented: files, interfaces, tests. Written when the milestone starts, not before. |
| GitHub Issues + Project | GitHub | *Status.* The single source of truth for what is in progress, blocked, or done. |

Plans hold decisions; GitHub holds status. Don't track status by editing plan checkboxes alone.

## GitHub structure

- **Milestones** = spec build slices: `M1 Pipeline foundation`, `M2 Map + live site`, `M3 Full data + county panel`, `M4 ML pipeline`, `M5 Model UI`, `M6 Methodology + polish`.
- **Issues** = one plan task each. The title starts with its plan ID, e.g. `M1.T3 Harmonize FIPS and Alaska geography changes`. The issue body links the plan section and lists its acceptance criteria.
- **Project board** "PNW Health Dashboard", Status field: `Backlog → Ready → In progress → In review → Merged to milestone → Done`.

## Branch model

```
main ◄──(milestone PR, author reviews, merge commit)── milestone/m1 ◄──(issue PRs, squash)── 7-acs-source
                                                                     ◄──────────────────── 8-harmonize
```

- **`main`** only receives milestone PRs. It is always deployable.
- **`milestone/m<N>`** is the integration branch for one milestone. It's created from `main` when the milestone starts and deleted after it merges.
- **Issue branches** `<issue-number>-<short-slug>` are cut from the current milestone branch, and each one's PR targets that branch.
- **Labels:**
  - `type:feature`, `type:bug`, `type:chore`, `type:docs`, `type:spike`
  - `area:pipeline`, `area:ml`, `area:web`, `area:infra`, `area:docs`
  - `checkpoint`: a gate that must be closed by the author before the next milestone starts
  - `future`: deferred work from spec §10; no milestone

## Lifecycle of a milestone

1. **Start.** Write the milestone's detailed plan. Reconcile its issues to match, and move them to `Ready`. Create `milestone/m<N>` from up-to-date `main`, push it, and open a **draft** milestone PR `milestone/m<N> → main` right away, so the chain of work collects in one place as issue PRs land.
2. **Issues.** Work through the issues following the lifecycle below.
3. **Milestone review.** When every issue is `Merged to milestone`, run the full checks on the milestone branch and fill in the milestone PR template. That means listing every issue PR, adding a `Closes #…` line for every issue, and including verification evidence. Then mark the PR ready for review.
4. **Merge.** The author reviews using [`docs/milestone-review-template.md`](docs/milestone-review-template.md) and approves. They then merge with a **merge commit**, not squash, so the per-issue commits stay on `main`. GitHub closes the issues, and the board moves them to `Done`. Delete the milestone branch.

## Lifecycle of an issue

1. **Ready.** The milestone plan exists and the issue body matches its task. Only `Ready` issues get picked up.
2. **In progress.** Create a branch from the up-to-date milestone branch, named `<issue-number>-<short-slug>`, e.g. `7-acs-source`. One issue per branch.
3. **Implement with TDD.** Follow the plan's steps: write a failing test, then make it pass, then commit. Small commits are fine on the branch.
4. **In review.** Open a PR into `milestone/m<N>` using the issue PR template. The PR title is in Conventional Commit form (`feat(pipeline): add ACS source`). The body says `Part of #<n>`, not `Closes`: closing keywords don't fire on non-default branches, so they live in the milestone PR. It also notes any deviation from the plan.
5. **Merged to milestone.** Checks pass (local in M1, `ci` from M2), the task gets a self-review against its plan section, and then it's squash-merged into the milestone branch. The squashed commit message is the PR title. Delete the branch and move the issue to `Merged to milestone`.

## Rules

- **`main` is always deployable.** No direct pushes, and only milestone PRs merge into it. From M2 onward, `ci` must pass on both issue PRs and milestone PRs.
- **The author owns `main`.** AI agents may open, update and squash-merge **issue PRs into a milestone branch** once checks pass and they've self-reviewed against the plan. Only the author approves and merges milestone PRs into `main` and closes `checkpoint` issues.
- **Keep milestone branches current.** If `main` changes during a milestone (rare, e.g. a hotfix), merge `main` into the milestone branch. Don't rebase it, because that would rewrite history other PRs are based on.
- **Hotfixes.** An urgent fix to `main` outside a milestone gets its own issue and a PR straight to `main`, which the author reviews.
- **Deviations go in writing.** If implementation must differ from the plan, say so in the PR. If it differs from the spec, update the spec in the same PR, or open a `type:docs` issue first if the change is large enough to discuss.
- **Checkpoints block.** The M4 `checkpoint` issue (model review) is resolved when the author reviews the M4 milestone PR. M5 doesn't start until that PR is merged.
- **New work gets an issue.** Bugs found along the way get a `type:bug` issue. Put them in the current milestone if they block it, otherwise in Backlog. Ideas outside the spec get `future`.
- **Plans are just-in-time.** When a milestone starts, write its detailed plan, then reconcile its issues (edit, split, add, close) so IDs match the plan's tasks before any issue moves to `Ready`.

## Definition of done (per issue PR; the milestone PR re-checks across the whole slice)

- [ ] Tests added or updated, and they pass locally and in CI
- [ ] `ruff check`, `ruff format --check`, `mypy` (pipeline) and `eslint`, `tsc --noEmit` (web) pass for touched code
- [ ] The issue's acceptance criteria are met
- [ ] Spec, plan, or README updated if behavior or decisions changed
- [ ] No raw or exported data committed (only test fixtures)

## Local commands

```bash
# pipeline
cd pipeline && uv sync && uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src
# web (from M2)
cd web && npm ci && npm test && npm run lint && npm run typecheck
```
