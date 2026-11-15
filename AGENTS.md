# AGENTS.md

Instructions for AI coding agents working in this repo. Humans: start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md). This file summarizes them for agents and does not replace them. If the two disagree, CONTRIBUTING wins.

## What this is

A static site for exploring county public health data across Washington, Oregon, Idaho and Alaska (149 counties). A Python pipeline fetches, harmonizes, models and exports five data files. A React site reads only those files and knows nothing about the sources.

| Path | Contents |
|---|---|
| `pipeline/` | Python 3.12 package `pnw-health`, managed with uv: fetch, harmonize, model, export |
| `web/` | React 19 and Vite site, with Vitest unit tests and Playwright e2e (`web/e2e/`) |
| `schema/` | JSON Schemas for the exported JSON files. This is the contract between pipeline and web |
| `workflow/` | `wf`, the agent workflow engine (stdlib Python 3.12), plus `graph.toml`, `project.toml` and prompts |
| `docs/superpowers/` | Specs (`specs/`, what and why) and plans (`plans/`, how) |
| `docs/reviews/` | Final-review write-ups and baselines |

## Commands

Run each from the directory shown.

```bash
# pipeline
cd pipeline && uv sync && uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src
# web
cd web && npm ci && npm test && npm run lint && npm run typecheck
# web e2e: always from a production build with CI=1
cd web && npm run build && CI=1 npx playwright test
# workflow engine
cd workflow && uv sync && uv run pytest && uv run ruff check && uv run ruff format --check && uv run mypy src
```

- **Without `CI=1`,** Playwright reuses any server already on port 4173, so a leftover `vite preview` will test a stale build.
- **Web types are generated** from `schema/` into `web/src/types/generated/` (git-ignored) by `npm run gen:types`. `dev`, `build`, `test` and `typecheck` run it first.
- **After changing the export contract,** regenerate the committed schemas with `cd pipeline && uv run pnw-health schema --root ..`, and commit them in the same change.
- **The full pipeline run** (`cd pipeline && uv run pnw-health run --root ..`) needs `CENSUS_API_KEY` and network access. On macOS, LightGBM needs `brew install libomp`. Tests don't need either.

## How work flows

- **Branches:**
  - `main` takes only milestone PRs.
  - Each milestone integrates on `milestone/m<N>`.
  - Issue branches are named `<issue>-<slug>`, are cut from the milestone branch, and their PRs target it.
- **Issue PRs:**
  - The title is a Conventional Commit (`feat(web): …`).
  - The body says `Part of #<n>`, not `Closes`. The `Closes` lines go in the milestone PR.
  - They are squash-merged into the milestone branch once `ci` is green.
- **The author owns `main`.** Agents may open, update and squash-merge issue PRs into `milestone/*`. Agents never approve or merge a milestone PR into `main` and never close `checkpoint` issues.
- **Specs are the authority, and plans argue from them.**
  - When implementation must differ from the plan, say so in the PR.
  - When it differs from the spec, update the spec in the same PR.
  - Status lives in GitHub issues, not in plan checkboxes.
- **Never rewrite shared history.** Don't force-push, and don't rebase a milestone branch. To update a branch, merge the milestone branch into it.
- **New work gets an issue.** Bugs found along the way get a `type:bug` issue. Ideas outside the spec get the `future` label.

## Conventions

- **TDD.** Write a failing test, make it pass, then commit. Small commits on the branch are fine.
- **Data:** never commit raw or exported data. `data/raw/` and `web/public/data/` are build outputs. Only test fixtures are committed.
- **E2E specs** import `test` and `expect` from `./fixtures`, not from `@playwright/test`. Otherwise PR `ci`'s 4× CPU throttle never applies to them.
- **E2E waits:** wait on observable conditions, never fixed sleeps. The Actions runner is several times slower than a dev machine, so keep each test well under its timeout at 4× throttle.
- **After a merge,** check `build-deploy` on the milestone branch as well as the PR checks.
- **Model output:** the site shows factors as *associated with* the model's estimate, never as causes. Keep copy consistent with the methodology page.

## Agent workflow runs

A milestone can be run as an orchestrated graph: `wf setup`, then the `run-milestone` skill. See [workflow/README.md](workflow/README.md), including its "Lessons" section.

- **Plans need a `toml workflow-tasks` block,** which `uv run --project workflow wf check-plan <plan>` checks.
- **`wf` writes the run state** (`.workflow/runs/`). Never edit those files by hand. Reviewer verdicts go in `.workflow/work/m<N>/verdicts/`.
- **With a run in progress, an issue PR merge needs records.** That means a passing gate record and a passing review record for the head commit, plus a green `ci`. Use `wf merge`.
- **Only the author clears an escalated node,** from their own terminal.
