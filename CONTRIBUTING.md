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
- **Project board** "PNW Health Dashboard", Status field: `Backlog → Ready → In progress → In review → Done`.
- **Labels:**
  - `type:feature`, `type:bug`, `type:chore`, `type:docs`, `type:spike`
  - `area:pipeline`, `area:ml`, `area:web`, `area:infra`, `area:docs`
  - `checkpoint`: a gate that must be closed by the author before the next milestone starts
  - `future`: deferred work from spec §10; no milestone

## Lifecycle of an issue

1. **Ready.** The milestone plan exists and the issue body matches its task. Only `Ready` issues get picked up.
2. **In progress.** Create a branch from up-to-date `main` named `<issue-number>-<short-slug>`, e.g. `7-acs-source`. One issue per branch.
3. **Implement with TDD.** Follow the plan's steps: write a failing test, then make it pass, then commit. Small commits are fine on the branch.
4. **In review.** Open a PR using the template. PR title in Conventional Commit form (`feat(pipeline): add ACS source`). The body says `Closes #<n>` and notes any deviation from the plan.
5. **Done.** CI is green and the author approves, then squash-merge. The squashed commit message is the PR title. The branch is deleted.

## Rules

- **`main` is always deployable.** No direct pushes. Every change goes through a PR. From M2 onward, `ci` must pass before merge.
- **The author merges.** AI agents may open and update PRs but never merge to `main` or close `checkpoint` issues.
- **Deviations go in writing.** If implementation must differ from the plan, say so in the PR. If it differs from the spec, update the spec in the same PR, or open a `type:docs` issue first if the change is large enough to discuss.
- **Checkpoints block.** M5 work does not start until the M4 `checkpoint` issue (model review) is closed.
- **New work gets an issue.** Bugs found along the way get a `type:bug` issue. Put them in the current milestone if they block it, otherwise in Backlog. Ideas outside the spec get `future`.
- **Plans are just-in-time.** When a milestone starts, write its detailed plan, then reconcile its issues (edit, split, add, close) so IDs match the plan's tasks before any issue moves to `Ready`.

## Definition of done (per PR)

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
