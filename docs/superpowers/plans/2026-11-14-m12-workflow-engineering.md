# M12 Workflow Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An orchestrated graph runs a milestone from an approved plan to a ready milestone PR. It stops for the author only at named gates. Mechanical nodes are token-free scripts, budgets and merges are enforced by hooks, work is paced to the usage window, and both review layers are kept but made cheaper.

**Architecture:** The graph is defined as data:
- `workflow/graph.toml` holds the generic nodes, budgets and model tiers.
- `workflow/project.toml` holds this repo's commands, paths and labels.

A small stdlib-only Python package, `wf` (in `workflow/`), owns run state, scheduling, gates, context packages, setup, merge, deploy-watch and milestone-PR output. A project skill, `run-milestone`, walks the graph. It asks `wf next` what to do, dispatches agent nodes with their packages and models, and reports results back through `wf`. Hooks keep the session from merging without records or editing run state.

**Tech Stack:** Python 3.12 run through `uv` (stdlib only at runtime; pytest, ruff and mypy for development), `gh` CLI, Claude Code skills, hooks and subagents, GitHub Actions, Playwright (CDP CPU throttling).

**Spec:** `docs/superpowers/specs/2026-11-14-m12-workflow-engineering-design.md`. Read it with this plan; section references (§) point there.

## Deviation from the spec

§7 says scripts use "the standard library only … no install". The system `python3` here is 3.9, which has no `tomllib`. The `wf` package therefore runs on Python 3.12 through `uv`, which the repo already requires for `pipeline/`.

- Runtime dependencies stay zero.
- `pytest`, `ruff` and `mypy` are dev-only, as in `pipeline/`.

Task 10 updates spec §7 to match.

## Global Constraints

- **No product change.** Nothing under `pipeline/src`, `schema/` or `web/src` changes. Web changes are limited to `web/e2e/` and `web/playwright.config.ts`.
- **`wf` has no runtime dependencies.** `workflow/pyproject.toml` lists none outside `[dependency-groups] dev`.
- **Every `wf` call goes through the same CLI:** `uv run --project workflow wf <command>`. Commands print JSON on stdout and exit non-zero with a one-line message on stderr when they fail. No traceback reaches the user for an expected failure.
- **Run state is in one place.** It lives in `.workflow/runs/m<N>/state.json`, git-ignored, written atomically (temp file + `os.replace`). Only `wf` writes there.
- **Records are keyed by commit.** Gate and review records are keyed by `(task_id, head_sha)`. A new commit invalidates both.
- **GitHub stays the source of truth** for issue and PR status (CONTRIBUTING). Run state never duplicates board status.
- **Budgets** (spec §5.2, verbatim):

  | Loop | Budget |
  |---|---|
  | implement↔gates | 3 rounds per task |
  | task-review | 2 rounds per task |
  | deploy-watch | 1 fix round per red run |
  | final-review | 1 |
  | batched-fix | 2 rounds |

- **Model tiers:** `strongest = "opus"`, `mid = "sonnet"`.
  - strongest: spec, plan, final-review, delta-review.
  - mid: implement, task-review, triage, batched-fix, retro.
- **Pacing defaults:** `margin = 1.5`, `min_samples = 3`, `default_pct_per_step = 0.5` (my call: about 6% for a 12-step task). The weekly window is checked like the 5-hour one.
- **The graph never approves or merges a PR into `main`** and never closes `checkpoint` issues. The existing `milestone/*`-only rule in `.claude/hooks/guard-merge.sh` stays.
- **Issue PR conventions (CONTRIBUTING):**
  - Issue branches are named `<issue-number>-<short-slug>`.
  - PRs target `milestone/m12`, with Conventional Commit titles and `Part of #<n>` bodies.
- **E2E runs before each PR that touches `web/`:** `cd web && npm run build && CI=1 npx playwright test`. After each squash-merge, check `build-deploy` on `milestone/m12`.

## Review Focus

1. **A corrupt or half-written `state.json`**, for example after a crash mid-save. Expected: `wf` refuses with "run state unreadable: <path>" and never starts a fresh run over it. Test in Task 1.
2. **`get_usage` reports `unavailable` or `not_applicable`** (an API key, or a read failure). Expected: the walker dispatches the earliest ready node without a fit check and records `pacing: off` for that decision, with no pause and no crash. Test in Task 2.
3. **A new commit pushed after the gate and review passed.** Expected: `wf check-merge` refuses because the records are for an older SHA, and the hook blocks `gh pr merge`. Test in Task 7.
4. **`resetsAt` in the past**, after a long pause or a sleeping laptop. Expected: the window counts as fresh, and the earliest ready node is considered first. Test in Task 2.
5. **A plan with no `workflow-tasks` block, an unknown `depends_on` id, a cycle, or an undeclared file overlap.** Expected: `wf setup` exits with each problem listed, before it creates any branch, issue or PR. Test in Task 3.

---

## Machine-readable task list

This block is the format `wf setup` parses (Task 3). It describes this plan's own tasks, so it doubles as the reference example.

When setup creates the issues, it compiles this block into a committed task graph, `<plan stem>.tasks.json`. The graph adds issue numbers, branches, reverse edges and a topological order, and it's what the orchestrator reads when it assigns tasks.

```toml workflow-tasks
[[task]]
id = "T1"
title = "Workflow package, graph config and run state"
steps = 10
depends_on = []
files = ["workflow/pyproject.toml", "workflow/graph.toml", "workflow/project.toml", "workflow/src/wf/config.py", "workflow/src/wf/state.py", "workflow/src/wf/cli.py", ".gitignore", ".github/workflows/ci.yml"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T2"
title = "Scheduler: readiness, estimates and window fit"
steps = 9
depends_on = ["T1"]
files = ["workflow/src/wf/schedule.py", "workflow/src/wf/cli.py"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T3"
title = "Plan task list and milestone setup script"
steps = 10
depends_on = ["T1", "T2"]
files = ["workflow/src/wf/tasks.py", "workflow/src/wf/github.py", "workflow/src/wf/setup.py", "workflow/src/wf/cli.py"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T4"
title = "Throttled e2e and an e2e job in PR ci"
steps = 8
depends_on = ["T1"]
files = ["web/e2e/fixtures.ts", "web/e2e/smoke.spec.ts", "web/e2e/a11y.spec.ts", "web/e2e/keyboard.spec.ts", "web/e2e/mobile.spec.ts", "web/e2e/pages404.spec.ts", "web/e2e/stage.spec.ts", ".github/workflows/ci.yml"]
labels = ["area:infra", "area:web", "type:feature"]

[[task]]
id = "T5"
title = "Gates script"
steps = 8
depends_on = ["T3", "T4"]
files = ["workflow/src/wf/gates.py", "workflow/src/wf/cli.py"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T6"
title = "Context packages and reviewer verdicts"
steps = 10
depends_on = ["T5"]
files = ["workflow/src/wf/packages.py", "workflow/src/wf/verdict.py", "workflow/schemas/verdict.schema.json", "workflow/src/wf/cli.py"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T7"
title = "Merge, deploy-watch and milestone PR scripts"
steps = 11
depends_on = ["T6"]
files = ["workflow/src/wf/merge.py", "workflow/src/wf/deploy.py", "workflow/src/wf/milestone_pr.py", "workflow/src/wf/cli.py"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T8"
title = "Committed hooks: merge records and run-state protection"
steps = 8
depends_on = ["T7"]
files = [".claude/hooks/guard-merge.sh", ".claude/hooks/guard-state.sh", ".claude/settings.json", "workflow/tests/test_hooks.py"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T9"
title = "Agent prompts and the run-milestone skill"
steps = 7
depends_on = ["T2", "T3", "T5", "T6", "T7", "T8"]
files = ["workflow/prompts/implement.md", "workflow/prompts/task-review.md", "workflow/prompts/final-review.md", "workflow/prompts/delta-review.md", "workflow/prompts/triage.md", "workflow/prompts/batched-fix.md", "workflow/prompts/retro.md", ".claude/skills/run-milestone/SKILL.md"]
labels = ["area:infra", "type:feature"]

[[task]]
id = "T10"
title = "Workflow docs: CONTRIBUTING, review template, lessons, spec sync"
steps = 6
depends_on = ["T9"]
files = ["CONTRIBUTING.md", "docs/milestone-review-template.md", "workflow/README.md", "docs/superpowers/specs/2026-11-14-m12-workflow-engineering-design.md", "docs/superpowers/plans/2026-11-10-roadmap.md"]
labels = ["area:docs", "type:docs"]

[[task]]
id = "T11"
title = "M11 baseline and final-review replay"
steps = 7
depends_on = ["T9"]
files = ["workflow/src/wf/baseline.py", "workflow/src/wf/cli.py", "docs/reviews/2026-11-14-m12-replay-and-baseline.md"]
labels = ["area:infra", "type:chore"]
```

The file overlaps on `cli.py` and `ci.yml` are why T2–T7 form a chain. T4 shares `ci.yml` with T1 only. T10 and T11 are independent of each other.

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `workflow/pyproject.toml` | `wf` package, `wf` console script, dev tools | 1 |
| `workflow/graph.toml` | Nodes, edges, kinds, budgets, model tiers (generic) | 1 |
| `workflow/project.toml` | Repo-specific commands, paths, labels, pacing | 1 |
| `workflow/src/wf/config.py` | Load and validate both TOML files | 1 |
| `workflow/src/wf/state.py` | Run state: nodes, rounds, records, usage, escalations | 1 |
| `workflow/src/wf/schedule.py` | Readiness, estimates, fit, `next` decision | 2 |
| `workflow/src/wf/tasks.py` | Parse and check the plan's `workflow-tasks` block | 3 |
| `workflow/src/wf/github.py` | `Gh`/`Git` runner protocol, real and fake | 3 |
| `workflow/src/wf/setup.py` | Milestone setup (old Task 0) | 3 |
| `web/e2e/fixtures.ts` | Playwright `test` with optional CPU throttle | 4 |
| `workflow/src/wf/gates.py` | Local checks for touched areas, gate record | 5 |
| `workflow/src/wf/packages.py` | Task, final and delta review packages | 6 |
| `workflow/src/wf/verdict.py`, `workflow/schemas/verdict.schema.json` | Verdict format and ingest | 6 |
| `workflow/src/wf/merge.py` | Merge-record check and squash-merge | 7 |
| `workflow/src/wf/deploy.py` | Wait for `build-deploy` on the milestone branch | 7 |
| `workflow/src/wf/milestone_pr.py` | PR body, final-review comment, outcome comment | 7 |
| `.claude/hooks/*.sh`, `.claude/settings.json` | Committed hooks | 8 |
| `workflow/prompts/*.md` | One prompt per agent node | 9 |
| `.claude/skills/run-milestone/SKILL.md` | The walker loop | 9 |
| `workflow/src/wf/baseline.py` | M11 baseline from transcripts and GitHub | 11 |

Tests live in `workflow/tests/test_<module>.py`.

---

### Task 0: Milestone setup (no issue; done the current way)

- [ ] **Step 1:** Create `milestone/m12` from up-to-date `main` and push it.
- [ ] **Step 2:** Add an `## M12 — Workflow engineering` section to the roadmap. It gets the goal above, T1–T11 as `M12.T1`–`M12.T11`, and the work order from the task list. Note that it absorbs GitHub milestone 14, "M? - Playwright e2e in PR checks".
- [ ] **Step 3:** Create one issue per task in GitHub milestone 15 (`M12 - Workflow Engineering`), titled `M12.T<n> <title>`, with the task's labels. Each body links the task's plan section and lists its acceptance criteria. Write the issue numbers into the roadmap. Close milestone 14 with a comment pointing at M12.T4.
- [ ] **Step 4:** Commit the spec, this plan and the roadmap on `docs/m12-plan`, open a PR into `milestone/m12`, and squash-merge it.
- [ ] **Step 5:** Open the draft milestone PR: `gh pr create --draft --base main --head milestone/m12 --template milestone.md`.

---

### Task 1: Workflow package, graph config and run state

**Files:**
- Create: `workflow/pyproject.toml`, `workflow/graph.toml`, `workflow/project.toml`, `workflow/src/wf/__init__.py`, `workflow/src/wf/config.py`, `workflow/src/wf/state.py`, `workflow/src/wf/cli.py`
- Modify: `.gitignore` (add `/.workflow/`), `.github/workflows/ci.yml` (add a `workflow` job: `uv sync`, `ruff check`, `ruff format --check`, `mypy src`, `pytest`; add it to the `ci` job's `needs` and its result checks)
- Test: `workflow/tests/test_config.py`, `workflow/tests/test_state.py`, `workflow/tests/test_cli.py`

**Interfaces:**
- Produces (`wf.config`):
  - `NodeKind = Literal["agent", "script", "gate"]`
  - `@dataclass(frozen=True) class NodeSpec: name: str; kind: NodeKind; per_task: bool; model_tier: str | None; budget: int | None; after: tuple[str, ...]`. `after` lists the nodes it follows.
  - `@dataclass(frozen=True) class Graph: nodes: dict[str, NodeSpec]; tiers: dict[str, str]`, with `def model_for(self, node: str) -> str | None`
  - `@dataclass(frozen=True) class Pacing: margin: float; min_samples: int; default_pct_per_step: float`
  - `@dataclass(frozen=True) class AreaChecks: paths: tuple[str, ...]; commands: tuple[str, ...]; cwd: str`
  - `@dataclass(frozen=True) class Project: repo: str; main_branch: str; milestone_branch: str; plans_dir: str; specs_dir: str; reviews_dir: str; roadmap: str; areas: dict[str, AreaChecks]; e2e: E2EConfig; pacing: Pacing; deploy_workflow: str`
    - `milestone_branch` is a format string: `"milestone/m{n}"`.
  - `@dataclass(frozen=True) class E2EConfig: paths: tuple[str, ...]; build: str; run: str; spec_glob: str; repeat_each: int; throttle: int; cwd: str`
  - `load_graph(path: Path) -> Graph` and `load_project(path: Path) -> Project`. Both raise `ConfigError(str)` on a missing key, an unknown `after` node or an unknown tier.
- Produces (`wf.state`):
  - `class RunStateError(Exception)` and `class BudgetExhausted(RunStateError)`
  - `NodeStatus = Literal["pending", "running", "done", "failed", "escalated"]`
  - `@dataclass class RunState: milestone: int; nodes: dict[str, NodeRecord]; gates: list[GateRecord]; reviews: list[ReviewRecord]; usage: list[UsageSample]; escalations: list[Escalation]; window: str | None`
    - `nodes` is keyed `"T3.implement"` for per-task nodes and `"final-review"` otherwise.
    - `window` is the `resetsAt` of the window the last dispatch happened in.
  - `NodeRecord(status: NodeStatus, rounds: int, started_at: str | None, finished_at: str | None, note: str | None)`
  - `GateRecord(task: str, sha: str, checks: dict[str, bool], passed: bool, at: str)` and `ReviewRecord(task: str, sha: str, node: str, result: Literal["pass", "findings"], verdict_path: str, at: str)`
  - `UsageSample(node: str, kind: str, steps: int, pct_before: float | None, pct_after: float | None, tokens: int | None)`
  - `Escalation(node: str, reason: str, at: str)`
  - `run_dir(root: Path, milestone: int) -> Path` returns `root / ".workflow/runs/m{milestone}"`
  - `init_run(root: Path, milestone: int, graph: Graph, task_ids: list[str], task_graph: str = "") -> RunState`. `task_graph` is the repo-relative path of the task graph file (format in Task 2), stored as `state.task_graph`. Raises `RunStateError` if a state file exists.
  - `load(root: Path, milestone: int) -> RunState`. Raises `RunStateError("run state unreadable: <path>")` on bad JSON or a bad shape.
  - `save(root: Path, state: RunState) -> None` (atomic)
  - `start_round(state: RunState, node: str, budget: int | None, now: str) -> None`. Raises `BudgetExhausted` and records an `Escalation` when `rounds == budget`.
  - `finish(state: RunState, node: str, status: NodeStatus, now: str, note: str | None = None) -> None`
  - `resume(state: RunState, node: str, now: str) -> None` moves an interrupted `running` node back to `pending` **without** using a round. An interruption caused by the usage window doesn't spend the budget.
  - `latest_gate(state, task, sha) -> GateRecord | None` and `latest_review(state, task, sha) -> ReviewRecord | None`
- Produces (`wf.cli`):
  - `main(argv: list[str] | None = None) -> int` with subcommands `init --milestone N --tasks T1,T2…`, `status`, `start NODE`, `finish NODE --status S [--note]`, `resume NODE` and `escalate NODE --reason`.
  - `--root` defaults to the git toplevel. Expected errors print `wf: <message>` to stderr and return 2.

`graph.toml` encodes spec §5.1/§5.2. The per-task nodes are `implement → gates → task-review → merge → deploy-watch`. The milestone nodes are `final-review → triage → batched-fix → delta-review → final-gates → milestone-pr → retro`. Budgets and tiers are as in Global Constraints. `project.toml` encodes CONTRIBUTING's local commands per area: `pipeline` (paths `pipeline/`, `schema/`), `web` (paths `web/`) and `workflow` (paths `workflow/`). It also holds the e2e command from Global Constraints and the pacing defaults.

- [ ] **Step 1: Write the failing config tests**

```python
def test_graph_loads_budgets_and_tiers():
    g = load_graph(REPO / "workflow/graph.toml")
    assert g.nodes["implement"].budget == 3 and g.nodes["implement"].per_task
    assert g.nodes["task-review"].budget == 2
    assert g.nodes["final-review"].budget == 1
    assert g.nodes["batched-fix"].budget == 2
    assert g.model_for("final-review") == "opus"
    assert g.model_for("task-review") == "sonnet"
    assert g.nodes["merge"].kind == "script"

def test_graph_rejects_unknown_after(tmp_path):
    p = tmp_path / "g.toml"; p.write_text(GRAPH_WITH_BAD_AFTER)
    with pytest.raises(ConfigError, match="unknown node 'nope'"):
        load_graph(p)

def test_project_pacing_defaults():
    p = load_project(REPO / "workflow/project.toml")
    assert p.pacing == Pacing(margin=1.5, min_samples=3, default_pct_per_step=0.5)
    assert p.milestone_branch.format(n=12) == "milestone/m12"
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd workflow && uv run pytest tests/test_config.py -q`
Expected: FAIL (module `wf.config` not found)

- [ ] **Step 3: Create the package, both TOML files and `wf.config`** as specified above.

- [ ] **Step 4: Write the failing state tests**

```python
def test_init_then_load_round_trips(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1", "T2"])
    assert set(s.nodes) >= {"T1.implement", "T2.merge", "final-review", "retro"}
    assert load(tmp_path, 13).nodes["T1.implement"].status == "pending"

def test_init_refuses_existing_run(tmp_path):
    init_run(tmp_path, 13, GRAPH, ["T1"])
    with pytest.raises(RunStateError, match="already exists"):
        init_run(tmp_path, 13, GRAPH, ["T1"])

def test_corrupt_state_is_refused_not_reset(tmp_path):          # Review Focus 1
    init_run(tmp_path, 13, GRAPH, ["T1"])
    (run_dir(tmp_path, 13) / "state.json").write_text('{"milestone": 13, "nod')
    with pytest.raises(RunStateError, match="run state unreadable"):
        load(tmp_path, 13)

def test_budget_exhaustion_escalates(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    for _ in range(2): start_round(s, "T1.task-review", 2, NOW)
    with pytest.raises(BudgetExhausted):
        start_round(s, "T1.task-review", 2, NOW)
    assert s.escalations[-1].node == "T1.task-review"
    assert s.nodes["T1.task-review"].status == "escalated"

def test_resume_does_not_spend_a_round(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"]); start_round(s, "T1.implement", 3, NOW)
    resume(s, "T1.implement", NOW)
    assert s.nodes["T1.implement"].status == "pending" and s.nodes["T1.implement"].rounds == 1

def test_records_are_per_sha(tmp_path):
    s = init_run(tmp_path, 13, GRAPH, ["T1"])
    s.gates.append(GateRecord("T1", "aaa", {"web": True}, True, NOW))
    assert latest_gate(s, "T1", "aaa").passed
    assert latest_gate(s, "T1", "bbb") is None
```

- [ ] **Step 5: Run them to make sure they fail**

Run: `cd workflow && uv run pytest tests/test_state.py -q`
Expected: FAIL (module `wf.state` not found)

- [ ] **Step 6: Implement `wf.state`.** Use dataclasses with `asdict` to write and explicit field checks to read. The atomic write goes to `state.json.tmp`, then `os.replace`.

- [ ] **Step 7: Write the failing CLI test**

```python
def test_cli_expected_error_is_one_line(tmp_path, capsys):
    assert main(["--root", str(tmp_path), "status", "--milestone", "13"]) == 2
    err = capsys.readouterr().err
    assert err.startswith("wf: ") and "Traceback" not in err and err.count("\n") == 1
```

- [ ] **Step 8: Implement `wf.cli`** with `argparse`. Every subcommand prints JSON (`status` prints the whole state).

- [ ] **Step 9: Run all checks**

Run: `cd workflow && uv sync && uv run pytest -q && uv run ruff check && uv run ruff format --check && uv run mypy src`
Expected: all pass

- [ ] **Step 10: Commit** the package, `.gitignore` and `ci.yml`: `feat(workflow): wf package with graph config and run state`.

---

### Task 2: Scheduler: readiness, estimates and window fit

**Files:**
- Create: `workflow/src/wf/schedule.py`
- Modify: `workflow/src/wf/cli.py` (add `next`, `usage`)
- Test: `workflow/tests/test_schedule.py`

**Interfaces:**
- Consumes: `Graph`, `Pacing`, `RunState`, `UsageSample` (Task 1).
- Produces:
  - `@dataclass(frozen=True) class Window: pct_used: float; resets_at: str`
  - `@dataclass(frozen=True) class Usage: five_hour: Window | None; weekly: Window | None`. `None` means unavailable or not applicable.
  - `parse_usage(get_usage_json: dict) -> Usage` reads the `plan.windows` labels `"5-hour limit"` and `"Weekly · all models"`. A `status` other than `"ok"` gives `Usage(None, None)`.
  - `TaskInfo(id: str, steps: int, depends_on: tuple[str, ...])`
  - **The task graph file** (in `wf.schedule`, written by Task 3's setup) is the orchestrator's cheap reference, so it never rebuilds dependencies from the plan:
    - `TaskNode(id: str, issue: int | None, title: str, steps: int, depends_on: tuple[str, ...], blocks: tuple[str, ...], files: tuple[str, ...], labels: tuple[str, ...], branch: str | None)`
      - `depends_on` holds direct dependencies only.
      - `blocks` is the reverse edge.
      - `branch` is `<issue>-<slug>` once the issue exists.
    - `TaskGraph(milestone: int, plan: str, spec: str, plan_sha: str, order: tuple[str, ...], tasks: dict[str, TaskNode])`. `order` is a topological order that breaks ties by plan order.
    - `write_task_graph(path: Path, graph: TaskGraph) -> None` and `load_task_graph(path: Path) -> TaskGraph`. The file is JSON with sorted keys and 2-space indents, so diffs read well.
    - `TaskGraph.infos() -> list[TaskInfo]` returns the tasks in `order`.
  - `ready_nodes(state: RunState, graph: Graph, tasks: list[TaskInfo]) -> list[str]`, returned in plan order. Plan order is task order, then node order within a task, then the milestone nodes.
    - A per-task node is ready when its `after` node is `done`.
    - A task's `implement` is ready when every `depends_on` task's `deploy-watch` is `done`.
    - `final-review` is ready when every task's `deploy-watch` is `done`.
    - Nodes that are `escalated` or `running` are never ready.
  - `estimate(state: RunState, kind: str, steps: int, pacing: Pacing) -> float`. With at least `min_samples` samples of that kind (both pcts present), it returns `median(pct_delta / steps) * steps`. Otherwise it returns `pacing.default_pct_per_step * steps`. Script and gate nodes always estimate `0.0`.
  - `Decision = Dispatch | Pause | Done | Blocked`, where:
    - `Dispatch(node: str, model: str | None, estimate: float, pacing: Literal["on", "off"])`
    - `Pause(until: str, reason: str)`
    - `Done()`
    - `Blocked(escalations: list[Escalation])`
  - `next_decision(state, graph, tasks, usage: Usage, pacing: Pacing, now: str) -> Decision` applies spec §5.8 in this order:
    1. If there are no ready nodes: return `Blocked` if any escalation is open, otherwise `Done`.
    2. If `usage.five_hour is None`: dispatch the first ready node with `pacing="off"`.
    3. A window is *fresh* if `state.window != five_hour.resets_at` or `resets_at <= now`.
       - In a fresh window, consider only the first ready node.
       - Otherwise consider every ready node in order.
    4. A node fits when `estimate * margin <= 100 - pct_used`, for the 5-hour window and also for the weekly window when present.
    5. Dispatch the first node considered that fits.
    6. If none fits: return `Pause(until=resets_at of the window that blocks)`.
    7. If a fresh window still doesn't fit its first ready node: return `Blocked` with a new escalation, "estimate exceeds a full window".
- CLI: `wf next --milestone N --usage FILE` reads the `get_usage` JSON (`-` for stdin) and prints the decision as JSON. It reads tasks **only** from the task graph file whose path is in run state (`state.task_graph`, set by `init_run`). It never opens the plan. `wf usage NODE --pct-before X --pct-after Y [--tokens T]` records a sample.

- [ ] **Step 1: Write the failing tests**

```python
def test_independent_small_tasks_fill_the_window():            # the author's 4/2/1 example
    s, tasks = run_with(tasks=[("T1", 8, ()), ("T2", 4, ()), ("T3", 2, ())])
    s.window = "R1"                                             # not fresh
    seed_samples(s, "implement", pct_per_step=0.5, n=3)         # T1≈4, T2≈2, T3≈1
    d = next_decision(s, G, tasks, usage(pct=97, resets="R1"), PACING, NOW)
    assert d == Dispatch("T2.implement", "sonnet", 2.0, "on")   # 2*1.5=3 fits in 3

def test_dependent_task_is_not_ready():
    s, tasks = run_with(tasks=[("T1", 8, ()), ("T2", 4, ("T1",))])
    assert "T2.implement" not in ready_nodes(s, G, tasks)

def test_fresh_window_takes_earliest_ready_only():
    s, tasks = run_with(tasks=[("T1", 8, ()), ("T2", 2, ())])
    s.window = "OLD"
    d = next_decision(s, G, tasks, usage(pct=0, resets="R2"), PACING, NOW)
    assert isinstance(d, Dispatch) and d.node == "T1.implement"

def test_nothing_fits_pauses_until_reset():
    s, tasks = run_with(tasks=[("T1", 8, ())]); s.window = "R1"
    d = next_decision(s, G, tasks, usage(pct=99, resets="R1"), PACING, NOW)
    assert d == Pause(until="R1", reason="no ready node fits the 5-hour window")

def test_unavailable_usage_dispatches_with_pacing_off():         # Review Focus 2
    s, tasks = run_with(tasks=[("T1", 8, ())])
    d = next_decision(s, G, tasks, Usage(None, None), PACING, NOW)
    assert d.node == "T1.implement" and d.pacing == "off"

def test_reset_in_the_past_counts_as_fresh():                   # Review Focus 4
    s, tasks = run_with(tasks=[("T1", 8, ()), ("T2", 2, ())]); s.window = PAST
    d = next_decision(s, G, tasks, usage(pct=50, resets=PAST), PACING, NOW)
    assert d.node == "T1.implement"

def test_estimate_falls_back_below_min_samples():
    s, _ = run_with(tasks=[]); seed_samples(s, "implement", pct_per_step=2.0, n=2)
    assert estimate(s, "implement", 10, PACING) == 5.0

def test_task_graph_round_trips_with_reverse_edges(tmp_path):
    g = task_graph(("T1", 8, ()), ("T2", 4, ("T1",)), ("T3", 2, ()))
    write_task_graph(tmp_path / "g.json", g)
    back = load_task_graph(tmp_path / "g.json")
    assert back == g and back.tasks["T1"].blocks == ("T2",)
    assert back.order.index("T1") < back.order.index("T2")

def test_next_does_not_read_the_plan(tmp_path, monkeypatch):
    root = run_on_disk(tmp_path, task_graph(("T1", 8, ())))
    monkeypatch.setattr(Path, "read_text", guard_against(".md"))   # raises if a plan .md is opened
    assert main(["--root", str(root), "next", "--milestone", "13", "--usage", str(USAGE_OK)]) == 0

def test_weekly_window_also_gates():
    s, tasks = run_with(tasks=[("T1", 2, ())]); s.window = "R1"
    d = next_decision(s, G, tasks, usage(pct=0, resets="R1", weekly=99.5), PACING, NOW)
    assert isinstance(d, Pause)
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd workflow && uv run pytest tests/test_schedule.py -q`
Expected: FAIL (module `wf.schedule` not found)

- [ ] **Step 3: Implement `wf.schedule`** as specified. Use `statistics.median`. `Dispatch` sets `state.window` only when the CLI records the dispatch (`wf start`), not inside `next_decision`, which stays pure.

- [ ] **Step 4: Add `next` and `usage` to the CLI**, and make `start` record `state.window` from the last `next` decision. Test `test_cli_next_reads_usage_from_stdin` asserts the JSON has a `"decision"` key.

- [ ] **Step 5: Run all `workflow` checks** (Task 1 Step 9 command). Expected: all pass.

- [ ] **Step 6: Commit:** `feat(workflow): schedule ready nodes by window fit`.

---

### Task 3: Plan task list and milestone setup script

**Files:**
- Create: `workflow/src/wf/tasks.py`, `workflow/src/wf/github.py`, `workflow/src/wf/setup.py`
- Modify: `workflow/src/wf/cli.py` (add `setup`, `check-plan`)
- Test: `workflow/tests/test_tasks.py`, `workflow/tests/test_setup.py`

**Interfaces:**
- Consumes: `Project`, `init_run`, `TaskInfo`.
- Produces:
  - `PlanTask(id: str, title: str, steps: int, depends_on: tuple[str, ...], files: tuple[str, ...], labels: tuple[str, ...])`. It has `def info(self) -> TaskInfo`.
  - `parse_plan_tasks(plan_text: str) -> list[PlanTask]` reads the one fenced block whose info string is `toml workflow-tasks`. It raises `PlanError("plan has no workflow-tasks block")`.
  - `check_plan(tasks: list[PlanTask]) -> list[str]` returns one message per problem, empty when the plan is valid:
    - an unknown `depends_on` id
    - a cycle
    - a duplicate id
    - an undeclared file overlap: tasks A before B share a file, and B doesn't depend on A directly or transitively. The message names both tasks and the file.
  - `plan_section(plan_text: str, task_id: str) -> str` returns the text from the heading `### Task <n>:` to the next `### `.
  - `class Gh(Protocol): def run(self, args: list[str]) -> str` and `class Git(Protocol): def run(self, args: list[str]) -> str`. It also provides `SubprocessGh`, `SubprocessGit`, and `FakeGh` / `FakeGit`, which record calls and return canned outputs for tests.
  - `setup_milestone(project, root, n: int, plan_path: Path, spec_path: Path, gh: Gh, git: Git) -> SetupResult(branch: str, issues: dict[str, int], plan_pr: int, milestone_pr: int)`. It is idempotent: it reuses an existing branch, issues whose titles start with `M<n>.T<k> `, and open PRs with the same head.
    1. `check_plan`. On any problem it raises `PlanError` listing all of them, before any `gh` or `git` call.
    2. Create and push `milestone/m<n>` from `origin/<main>`.
    3. Create the GitHub milestone if missing.
    4. Create one issue per task: title `M<n>.T<k> <title>`, the task's labels, and a body with the plan path, the task heading and its acceptance criteria. The criteria are the section's step titles.
    5. Append the roadmap section, in M11's format: goal, plan, spec, `M<n>.T<k> #<issue> <title>` lines and a work-order line generated from `depends_on`.
    6. **Write the task graph** with `write_task_graph` to `<plans_dir>/<plan stem>.tasks.json`. It includes each task's issue number and branch, `blocks`, the topological `order`, and `plan_sha`, the blob SHA of the plan it was built from.
    7. Commit spec, plan, roadmap and task graph on `docs/m<n>-plan`, open a PR into the milestone branch, and squash-merge it. The graph is committed so that it survives a lost run directory and can be read in review.
    8. Open the draft milestone PR with `--template milestone.md`.
    9. `init_run` with the task graph's path.
  - `wf check-plan` also reports when a committed task graph's `plan_sha` doesn't match the current plan, with the message "task graph is stale: re-run wf setup". Re-running setup is idempotent and rewrites only the graph file.
- CLI: `wf check-plan PLAN` prints `{"problems": [...]}` and exits 2 when there are any. `wf setup --milestone N --plan P --spec S`.

- [ ] **Step 1: Write the failing task-list tests**

```python
def test_parses_this_plans_own_block():
    tasks = parse_plan_tasks((REPO / M12_PLAN).read_text())
    assert [t.id for t in tasks][:3] == ["T1", "T2", "T3"]
    assert check_plan(tasks) == []

def test_missing_block():                                       # Review Focus 5
    with pytest.raises(PlanError, match="no workflow-tasks block"):
        parse_plan_tasks("# Plan\n")

def test_problems_are_all_listed():                             # Review Focus 5
    ts = [pt("T1", files=["a.py"]), pt("T2", files=["a.py"]),
          pt("T3", depends_on=["T9"]), pt("T4", depends_on=["T5"]), pt("T5", depends_on=["T4"])]
    msgs = check_plan(ts)
    assert any("T2" in m and "T1" in m and "a.py" in m for m in msgs)
    assert any("unknown" in m and "T9" in m for m in msgs)
    assert any("cycle" in m for m in msgs)

def test_transitive_dependency_covers_overlap():
    ts = [pt("T1", files=["a.py"]), pt("T2", depends_on=["T1"]), pt("T3", depends_on=["T2"], files=["a.py"])]
    assert check_plan(ts) == []
```

- [ ] **Step 2: Run them to make sure they fail.** `cd workflow && uv run pytest tests/test_tasks.py -q` → FAIL.

- [ ] **Step 3: Implement `wf.tasks` and `wf.github`.** Block extraction uses a regex on the fence's info string, and the block is parsed with `tomllib`.

- [ ] **Step 4: Write the failing setup tests** with `FakeGh` and `FakeGit`

```python
def test_bad_plan_makes_no_calls(tmp_path):
    gh, git = FakeGh(), FakeGit()
    with pytest.raises(PlanError):
        setup_milestone(PROJECT, tmp_path, 13, bad_plan(tmp_path), spec(tmp_path), gh, git)
    assert gh.calls == [] and git.calls == []

def test_setup_is_idempotent(tmp_path):
    gh = FakeGh(existing_issues={"M13.T1 First": 300}); git = FakeGit(branches={"milestone/m13"})
    r = setup_milestone(PROJECT, tmp_path, 13, good_plan(tmp_path), spec(tmp_path), gh, git)
    assert r.issues["T1"] == 300
    assert not any(c[:2] == ["issue", "create"] and "M13.T1 First" in c for c in gh.calls)

def test_setup_writes_task_graph_with_issues(tmp_path):
    gh = FakeGh(next_issue=300)
    setup_milestone(PROJECT, tmp_path, 13, good_plan(tmp_path), spec(tmp_path), gh, FakeGit())
    g = load_task_graph(next((tmp_path / PROJECT.plans_dir).glob("*.tasks.json")))
    assert g.tasks["T1"].issue == 300 and g.tasks["T1"].branch.startswith("300-")
    assert g.tasks["T1"].blocks == ("T2",)

def test_stale_task_graph_is_reported(tmp_path):
    plan = good_plan(tmp_path); setup_milestone(PROJECT, tmp_path, 13, plan, spec(tmp_path), FakeGh(), FakeGit())
    plan.write_text(plan.read_text() + "\n<!-- edited -->\n")
    assert any("task graph is stale" in m for m in check_plan_file(plan))

def test_issue_body_links_plan_section(tmp_path):
    gh = FakeGh(); setup_milestone(PROJECT, tmp_path, 13, good_plan(tmp_path), spec(tmp_path), gh, FakeGit())
    body = gh.created_issue_body("M13.T2 Second")
    assert "docs/superpowers/plans/" in body and "### Task 2:" in body
```

- [ ] **Step 5: Implement `wf.setup` and the CLI commands.**

- [ ] **Step 6: Run all `workflow` checks.** Expected: all pass.

- [ ] **Step 7: Commit:** `feat(workflow): plan task list and milestone setup`.

---

### Task 4: Throttled e2e and an e2e job in PR ci

**Files:**
- Create: `web/e2e/fixtures.ts`
- Modify: every `web/e2e/*.spec.ts` (import `test` and `expect` from `./fixtures`), `.github/workflows/ci.yml`
- Test: the existing e2e suite, run throttled

**Interfaces:**
- Produces:
  - `web/e2e/fixtures.ts` exports `test` and `expect`. `test` extends Playwright's `test` with an auto fixture.
    - When `E2E_CPU_THROTTLE` is a number > 1, the fixture opens a CDP session for the page and sends `Emulation.setCPUThrottlingRate { rate }`.
    - Otherwise it does nothing.
    - On a non-Chromium browser it does nothing.
  - A `ci.yml` job `e2e` on `pull_request`. Its steps copy `build-deploy`: checkout, uv, node, the `data/raw` cache with the same key, the pipeline run with `CENSUS_API_KEY`, `npm ci`, `npm run build`, and Playwright install.
    - It runs `CI=1 npx playwright test`.
    - It then lists the e2e specs changed since the base: `git diff --name-only origin/${{ github.base_ref }}...HEAD -- 'web/e2e/*.spec.ts'`. If there are any, it runs them again with `E2E_CPU_THROTTLE=4 CI=1 npx playwright test <files> --repeat-each=3`.
    - It uploads the report on failure.
    - `ci` gets `e2e` added to its `needs` and its result checks.
    - Checkout needs `fetch-depth: 0` for the diff.

- [ ] **Step 1: Write `fixtures.ts` and switch the spec imports.**

- [ ] **Step 2: Confirm unthrottled behavior is unchanged.**
Run: `cd web && npm run build && CI=1 npx playwright test`
Expected: the same pass count as on `milestone/m12` before the change.

- [ ] **Step 3: Confirm the throttle is applied.** Add a temporary local check (not committed) that `E2E_CPU_THROTTLE=4` makes a busy loop measured by `page.evaluate` at least 2.5× slower than unthrottled. Then delete it.

- [ ] **Step 4: Run the whole suite throttled once.**
Run: `cd web && E2E_CPU_THROTTLE=4 CI=1 npx playwright test`
Expected: all pass, with every test under the 30s timeout. If a test fails only when throttled, fix the wait in that test (wait on an observable condition, not a sleep) in this task.

- [ ] **Step 5: Add the `e2e` job to `ci.yml`.**

- [ ] **Step 6: Lint and typecheck.** Run: `cd web && npm run lint && npm run typecheck`. Expected: pass.

- [ ] **Step 7: Open the PR and confirm the `e2e` job runs and passes on it,** including the throttled repeat, since this PR changes every spec. Record its duration in the PR body.

- [ ] **Step 8: Commit:** `ci: e2e in PR checks, with throttled repeats for changed specs`.

---

### Task 5: Gates script

**Files:**
- Create: `workflow/src/wf/gates.py`
- Modify: `workflow/src/wf/cli.py` (add `gate`)
- Test: `workflow/tests/test_gates.py`

**Interfaces:**
- Consumes: `Project.areas`, `Project.e2e`, `RunState`, `GateRecord`, `Git`.
- Produces:
  - `areas_touched(paths: list[str], project: Project) -> set[str]`
  - `changed_specs(paths: list[str], project: Project) -> list[str]`, matched with `project.e2e.spec_glob`
  - `class Runner(Protocol): def __call__(self, cmd: str, cwd: Path, env: dict[str, str]) -> int`
  - `run_gates(project, root, task: str, base_ref: str, git: Git, runner: Runner) -> GateRecord`. It:
    - diffs `base_ref...HEAD`
    - runs each touched area's commands
    - runs e2e build + run when any `e2e.paths` are touched
    - runs the throttled repeat (`E2E_CPU_THROTTLE=<throttle>`, `--repeat-each=<repeat_each>`) on changed specs
    - keys the record by `git rev-parse HEAD`
    - names checks `"<area>:<command>"`, `"e2e"` and `"e2e:throttled"`

    It stops at the first failure and records the remaining checks as not run (`False`).
- CLI: `wf gate TASK --milestone N` runs the gates, appends the record and prints it. It exits 1 if the gates failed, 0 if they passed.

- [ ] **Step 1: Write the failing tests** with a recording runner

```python
def test_only_touched_areas_run():
    rec = gate_with(paths=["workflow/src/wf/state.py"])
    assert set(rec.checks) == {f"workflow:{c}" for c in PROJECT.areas["workflow"].commands}

def test_web_change_runs_e2e_and_throttled_repeat_for_changed_specs():
    rec, calls = gate_with(paths=["web/src/x.ts", "web/e2e/stage.spec.ts"], with_calls=True)
    assert rec.checks["e2e"] and rec.checks["e2e:throttled"]
    throttled = [c for c in calls if c.env.get("E2E_CPU_THROTTLE") == "4"]
    assert throttled and "web/e2e/stage.spec.ts".removeprefix("web/") in throttled[0].cmd and "--repeat-each=3" in throttled[0].cmd

def test_failure_stops_and_marks_rest_not_run():
    rec = gate_with(paths=["pipeline/src/a.py", "web/src/b.ts"], fail_on="uv run mypy src")
    assert not rec.passed and rec.checks["pipeline:uv run mypy src"] is False
    assert all(v is False for k, v in rec.checks.items() if k.startswith("web:"))

def test_record_is_keyed_to_head():
    assert gate_with(paths=["workflow/x.py"], head="abc123").sha == "abc123"
```

- [ ] **Step 2: Run them to make sure they fail.**
- [ ] **Step 3: Implement `wf.gates` and `wf gate`.** The real runner uses `subprocess.run(cmd, shell=True, cwd=…, env=os.environ | env)` and sends output to `.workflow/runs/m<N>/logs/<task>-<sha>-<check>.log`.
- [ ] **Step 4: Run all `workflow` checks.**
- [ ] **Step 5: Try it on a real branch:** `uv run --project workflow wf gate T5 --milestone 12` on this task's branch, which has no run state for 12. Expected: a clear "no run for m12" error. Then run it with a throwaway `wf init --milestone 99`, which should pass, and delete `.workflow/runs/m99` afterwards.
- [ ] **Step 6: Commit:** `feat(workflow): gates for touched areas, keyed to head`.

---

### Task 6: Context packages and reviewer verdicts

**Files:**
- Create: `workflow/src/wf/packages.py`, `workflow/src/wf/verdict.py`, `workflow/schemas/verdict.schema.json`
- Modify: `workflow/src/wf/cli.py` (add `package`, `ingest`)
- Test: `workflow/tests/test_packages.py`, `workflow/tests/test_verdict.py`

**Interfaces:**
- Consumes: `plan_section`, `parse_plan_tasks` (Task 3), `RunState`, `GateRecord`, `ReviewRecord`.
- Produces:
  - `Severity = Literal["critical", "important", "minor"]`
  - `Finding(id: str, severity: Severity, title: str, file: str | None, line: int | None, detail: str)`
  - `Verdict(node: str, task: str | None, sha: str, result: Literal["pass", "findings"], findings: list[Finding], blocking: bool)`. `blocking` is true when any finding is critical or important.
  - `load_verdict(path: Path) -> Verdict` raises `VerdictError` listing every schema violation. The schema file documents the same shape for the prompts.
  - `ingest(state: RunState, node: str, path: Path, now: str, head: str) -> ReviewRecord`. It loads the verdict, checks that `verdict.node == node` and that `verdict.sha == head` (the PR's head, read by the CLI), and appends the record.
  - `spec_section(spec_text: str, title_regex: str) -> str` returns the section under the first heading or bold label matching the regex, up to the next heading of the same or higher level.
  - Package builders write Markdown to `.workflow/runs/m<N>/packages/<node>.md` and return the path:
    - `task_review_package(root, state, plan_path, spec_path, task_id, base_ref, git) -> Path`. Sections: "Diff" (`git diff base...HEAD`), "Task", "Global constraints", "Spec anti-goals" (as a checklist), "Gate results", "Earlier findings on this task", "Rules" (do not explore beyond this package except to read a current file when a hunk is not enough; write the verdict to `<path>` matching `verdict.schema.json`).
    - `final_package(root, state, plan_path, spec_path, range_: str, git, gh) -> Path`. Sections: "Range" + `--stat`, "Review Focus", "Spec goals and anti-goals", "Task review outcomes and deferred minors", "build-deploy history" (from `gh run list`), "Escalations", "Rules" (free access to the repo and running app; the package is a head start, not a fence).
    - `delta_package(root, state, fix_range: str, findings: list[Finding], git) -> Path`
- CLI: `wf package {task-review|final|delta} …` prints `{"path": …, "verdict_path": …}`. `wf ingest NODE VERDICT` prints the record. It exits 2 on a `VerdictError` or a SHA mismatch.

- [ ] **Step 1: Write the failing verdict tests**

```python
def test_findings_with_important_block():
    v = load_verdict(write_json(tmp, verdict(findings=[f("I1", "important")])))
    assert v.result == "findings" and v.blocking

def test_bad_verdict_lists_every_problem():
    with pytest.raises(VerdictError) as e:
        load_verdict(write_json(tmp, {"node": "x", "result": "maybe", "findings": [{"severity": "huge"}]}))
    assert "result" in str(e.value) and "severity" in str(e.value) and "sha" in str(e.value)

def test_ingest_rejects_stale_sha(tmp_path):
    s = state_with_task("T1")
    with pytest.raises(VerdictError, match="sha"):
        ingest(s, "T1.task-review", write_json(tmp_path, verdict(sha="old")), NOW, head="new")
```

- [ ] **Step 2: Write the failing package tests** against the real M11 plan and spec in the repo

```python
def test_task_package_has_its_sections(tmp_path):
    p = task_review_package(tmp_path, STATE, M11_PLAN, M11_SPEC, "T3", "8960663", FakeGit(diff="DIFF"))
    text = p.read_text()
    for h in ["## Diff", "## Task", "## Global constraints", "## Spec anti-goals", "## Gate results", "## Rules"]:
        assert h in text
    assert "### Task 3:" in text and "### Task 4:" not in text
    assert "- [ ]" in text.split("## Spec anti-goals")[1]

def test_final_package_does_not_fence_the_reviewer(tmp_path):
    text = final_package(tmp_path, STATE, M11_PLAN, M11_SPEC, "8960663..544bbf2", FakeGit(), FakeGh()).read_text()
    assert "Review Focus" in text and "free access" in text
```

- [ ] **Step 3: Run both to make sure they fail.**
- [ ] **Step 4: Implement `wf.verdict`, the schema file and `wf.packages`.** If `spec_section` finds no anti-goals in a spec, the package says so in that section instead of failing.
- [ ] **Step 5: Add the CLI commands.** `ingest` reads the head SHA with `gh pr view <pr> --json headRefOid`.
- [ ] **Step 6: Run all `workflow` checks.**
- [ ] **Step 7: Commit:** `feat(workflow): review packages and verdict ingest`.

---

### Task 7: Merge, deploy-watch and milestone PR scripts

**Files:**
- Create: `workflow/src/wf/merge.py`, `workflow/src/wf/deploy.py`, `workflow/src/wf/milestone_pr.py`
- Modify: `workflow/src/wf/cli.py` (add `check-merge`, `merge`, `deploy-watch`, `milestone-pr`, `post-final-review`, `post-outcomes`)
- Test: `workflow/tests/test_merge.py`, `workflow/tests/test_deploy.py`, `workflow/tests/test_milestone_pr.py`

**Interfaces:**
- Consumes: `latest_gate`, `latest_review`, `Verdict`, `Gh`, `Project`.
- Produces:
  - `MergeCheck(ok: bool, reasons: list[str])`
  - `check_merge(state: RunState, task: str, pr: int, gh: Gh) -> MergeCheck`. It reads `headRefOid`, `baseRefName` and `statusCheckRollup` from `gh pr view`. It is ok only when every one of these holds:
    - the base matches `milestone/*`
    - there is a passing gate for the head
    - there is a review with `result == "pass"` for the head
    - the rollup check named `ci` is `SUCCESS`
  - `merge_task(state, task, pr, gh) -> str` calls `check_merge`, then `gh pr merge <pr> --squash --delete-branch`, and returns the merged commit SHA. Tasks only start after their dependencies merge (Task 2), so there are never stacked PRs to retarget.
  - `DeployResult(conclusion: Literal["success", "failure", "timeout"], run_url: str | None)`
  - `watch_deploy(gh, project, branch: str, sha: str, timeout_s: int = 1800, poll_s: int = 30, sleep=time.sleep) -> DeployResult`. It finds the `build-deploy` run whose `headSha == sha` and waits for it to complete.
  - `render_milestone_body(state, tasks: list[PlanTask], issues: dict[str, int], template: str) -> str` fills the `milestone.md` sections that come from run state: Issue PRs, Closes, Verification (gate records) and the escalation log. Summary, Review guide and Deviations stay for the final-review and retro nodes to fill.
  - `render_outcomes(findings: list[Finding], outcomes: dict[str, str]) -> str` produces a table: finding → `fixed in #…` / `deferred to #…` / `ask author`.
  - `post_final_review(gh, pr: int, report: Path) -> None` posts with `gh pr comment --body-file`. `post_outcomes(gh, pr, text)` does the same. `mark_ready(gh, pr)` runs `gh pr ready`.
  - Nothing in this module calls `gh pr merge` on a PR whose base is `main`, or `gh pr review --approve`.

- [ ] **Step 1: Write the failing merge tests**

```python
def test_new_commit_after_review_blocks_merge():                 # Review Focus 3
    s = state_with(gate=("T1", "aaa", True), review=("T1", "aaa", "pass"))
    c = check_merge(s, "T1", 5, FakeGh(pr_view={"headRefOid": "bbb", "baseRefName": "milestone/m13", "statusCheckRollup": [ci("SUCCESS")]}))
    assert not c.ok and any("gate" in r for r in c.reasons) and any("review" in r for r in c.reasons)

def test_red_ci_blocks_merge():
    s = state_with(gate=("T1", "aaa", True), review=("T1", "aaa", "pass"))
    assert not check_merge(s, "T1", 5, FakeGh(pr_view=view("aaa", ci="FAILURE"))).ok

def test_main_base_is_refused_even_with_records():
    s = state_with(gate=("T1", "aaa", True), review=("T1", "aaa", "pass"))
    assert not check_merge(s, "T1", 5, FakeGh(pr_view=view("aaa", base="main"))).ok

def test_merge_squashes_and_deletes_branch():
    gh = FakeGh(pr_view=view("aaa")); merge_task(passing_state("aaa"), "T1", 5, gh)
    assert ["pr", "merge", "5", "--squash", "--delete-branch"] in gh.calls
```

- [ ] **Step 2: Write the failing deploy and milestone-PR tests**

```python
def test_watch_matches_sha_and_reports_failure():
    gh = FakeGh(run_lists=[[], [run("aaa", "in_progress")], [run("aaa", "completed", "failure")]])
    assert watch_deploy(gh, PROJECT, "milestone/m13", "aaa", sleep=lambda s: None).conclusion == "failure"

def test_watch_times_out():
    gh = FakeGh(run_lists=[[]] * 100)
    assert watch_deploy(gh, PROJECT, "milestone/m13", "aaa", timeout_s=60, poll_s=30, sleep=lambda s: None).conclusion == "timeout"

def test_body_lists_every_issue_with_closes():
    body = render_milestone_body(STATE, TASKS, {"T1": 300, "T2": 301}, TEMPLATE)
    assert "Closes #300" in body and "Closes #301" in body

def test_outcomes_table():
    t = render_outcomes([f("C1", "critical"), f("M2", "minor")], {"C1": "fixed in #410", "M2": "deferred to #411"})
    assert "| C1 |" in t and "fixed in #410" in t and "deferred to #411" in t
```

- [ ] **Step 3: Run them to make sure they fail.**
- [ ] **Step 4: Implement the three modules and their CLI commands.** `wf deploy-watch` is meant to be run in the background by the walker. It exits 0 on success, 1 on failure and 3 on timeout.
- [ ] **Step 5: Run all `workflow` checks.**
- [ ] **Step 6: Commit:** `feat(workflow): merge on records, watch deploys, fill the milestone PR`.

---

### Task 8: Committed hooks: merge records and run-state protection

**Files:**
- Modify: `.claude/hooks/guard-merge.sh` (after the existing base check, if `.workflow/runs/m<N>/state.json` exists for the PR's milestone, call `uv run --project workflow wf check-merge <pr>` and block with its reasons when not ok)
- Create: `.claude/hooks/guard-state.sh`, `.claude/settings.json`
- Test: `workflow/tests/test_hooks.py` (runs the shell hooks with JSON on stdin)

**Interfaces:**
- Consumes: `wf check-merge` (Task 7).
- Produces:
  - `guard-merge.sh` keeps its current behavior for milestones without a run, so M12's own merges work. For milestones with a run it also requires `check-merge` to pass. It extracts the milestone number from the base branch `milestone/m<N>`.
  - `guard-state.sh` (PreToolUse, matcher `Edit|Write|MultiEdit|NotebookEdit|Bash`) exits 2 with a message when:
    - an Edit or Write `file_path` resolves under `.workflow/runs/`, or
    - a Bash command mentions `.workflow/runs` and does not start with `uv run --project workflow wf `.
  - `.claude/settings.json` (committed) registers both hooks, as `settings.local.json` does today. The `gh pr merge` allow rule stays in `settings.local.json`.

- [ ] **Step 1: Write the failing hook tests**

```python
def test_state_edit_blocked():
    assert run_hook("guard-state.sh", {"tool_name": "Write", "tool_input": {"file_path": f"{REPO}/.workflow/runs/m13/state.json"}}).returncode == 2

def test_state_write_via_bash_blocked_but_wf_allowed():
    assert run_hook("guard-state.sh", bash("echo x > .workflow/runs/m13/state.json")).returncode == 2
    assert run_hook("guard-state.sh", bash("uv run --project workflow wf finish T1.implement --milestone 13 --status done")).returncode == 0

def test_unrelated_edit_allowed():
    assert run_hook("guard-state.sh", {"tool_name": "Edit", "tool_input": {"file_path": f"{REPO}/web/src/a.ts"}}).returncode == 0

def test_merge_guard_uses_records_when_run_exists(fake_gh_on_path, run_m13_without_records):
    r = run_hook("guard-merge.sh", bash("gh pr merge 5 --squash"))
    assert r.returncode == 2 and "gate" in r.stderr

def test_merge_guard_unchanged_without_run(fake_gh_on_path):
    assert run_hook("guard-merge.sh", bash("gh pr merge 5 --squash")).returncode == 0
```

`fake_gh_on_path` puts a stub `gh` first on `PATH` that answers `pr view` from a JSON file.

- [ ] **Step 2: Run them to make sure they fail.**
- [ ] **Step 3: Implement the hooks and `.claude/settings.json`.**
- [ ] **Step 4: Remove `.claude/hooks/` from `.git/info/exclude`** (a local file, not committed). Remove the duplicate hook registration from `settings.local.json`, so each hook runs once. Note both in the PR body for the author, who has the same local files.
- [ ] **Step 5: Run all `workflow` checks.**
- [ ] **Step 6: Commit:** `feat(workflow): committed hooks for merge records and run state`.

---

### Task 9: Agent prompts and the run-milestone skill

**Files:**
- Create: `workflow/prompts/{implement,task-review,final-review,delta-review,triage,batched-fix,retro}.md`, `.claude/skills/run-milestone/SKILL.md`

**Interfaces:**
- Consumes: every `wf` CLI command (Tasks 1–7). It also uses `mcp__ccd_session_mgmt__get_usage`, `PushNotification`, `ScheduleWakeup` (only under `/loop`) and the Agent tool's `model` parameter.
- Produces:
  - **Each prompt** states the node's input (the package path, or the task section for implement), its output, and its exit condition.
    - Reviewer prompts end with "Write your verdict to `<verdict_path>` matching `workflow/schemas/verdict.schema.json`; do not merge, push or edit code".
    - `implement.md` and `batched-fix.md` require a commit and push after every green TDD step, and accept a "steps already committed" list for a restart (spec §5.8).
    - `final-review.md` carries the M11 review's structure: strengths, then issues by severity with file:line and evidence. It says the package is a head start.
    - `triage.md` outputs `must-fix | defer | ask-author` per finding, as JSON, to a path in the package.
    - `retro.md` writes `docs/reviews/<date>-m<N>-retro.md`. It covers tokens per node, rounds per loop, escalations and the pilot targets from spec §5.10, and proposes guards, each as a test, constraint or checklist line with where it goes.
  - **`SKILL.md`** (`/run-milestone <N>`) is the walker loop:
    1. `get_usage`. Write the result to `.workflow/runs/m<N>/usage.json` via `wf` (`wf next --usage -` on stdin; the skill never writes run state itself).
    2. `wf next`.
    3. On `Dispatch`:
       - Agent node: `wf start`, then `wf package` if it's a review node, then dispatch the subagent with `model` from the decision and the prompt plus package. On return: `get_usage`, `wf usage` (pct before and after, plus subagent tokens from the task notification), then `wf ingest` (reviewers) or `wf finish`.
       - Script node: run its `wf` command. Run `deploy-watch` in the background.
    4. On `Pause`: `PushNotification` with the reason and the time. Under `/loop`, `ScheduleWakeup` for `min(3600, until − now)`; otherwise stop the turn.
    5. On `Blocked`: `PushNotification` with the escalations, then stop.
    6. On `Done`: stop and report.
    7. The milestone tail, in order:
       - final-review: commit the report to `docs/reviews/` and run `wf post-final-review`.
       - triage.
       - batched-fix and delta-review, at most 2 rounds.
       - final gates.
       - `wf post-outcomes`.
       - `wf milestone-pr`, then mark the PR ready.
       - retro, landing on the milestone branch.
       - Stop and notify: "M<N> ready for your verdict".
    8. **Hard rules in the skill text:**
       - never merge a PR whose base is `main`, and never approve one
       - never write under `.workflow/runs/`
       - on any unexpected `wf` exit, escalate rather than improvise
       - on a restart, read `wf status` first. For each node left `running` with no live subagent, call `wf resume`, then dispatch it again with the list of steps already committed on its branch.

- [ ] **Step 1: Write the seven prompts.**
- [ ] **Step 2: Write `SKILL.md`.**
- [ ] **Step 3: Dry run on a toy milestone.** In a scratch clone, write a two-task plan whose tasks only touch `workflow/README.md`. Point `project.toml` at a fork-free test repo or use `--dry-run` for `gh` writes, run `wf init --milestone 99`, and walk `/run-milestone 99` through:
  - one implement node (sonnet)
  - one task review (sonnet)
  - one forced budget exhaustion, by giving the reviewer a verdict file with an important finding twice
  - one pause, by feeding a `get_usage` JSON with `percentUsed: 99`

  Expected: the escalation and the pause each notify and stop, `wf status` shows every transition, and no file under `.workflow/runs/` was written except by `wf`. Record the transcript summary in the PR body.
- [ ] **Step 4: Commit:** `feat(workflow): agent prompts and the run-milestone skill`.

If Step 3 needs `--dry-run` support in `wf` for `gh` writes, add a global `--dry-run` flag to the CLI in this task. It should print the `gh` calls instead of making them, with a test.

---

### Task 10: Workflow docs: CONTRIBUTING, review template, lessons, spec sync

**Files:**
- Modify: `CONTRIBUTING.md`, `docs/milestone-review-template.md`, `docs/superpowers/specs/2026-11-14-m12-workflow-engineering-design.md`, `docs/superpowers/plans/2026-11-10-roadmap.md`
- Create: `workflow/README.md`

- [ ] **Step 1: Write `workflow/README.md`.** It should cover:
  - what the graph is (a diagram from spec §5.1)
  - how to start a run: `wf setup`, then `/run-milestone <N>`, optionally under `/loop`
  - the gates and what a pause or escalation looks like
  - how to change budgets, tiers and pacing
  - which parts are generic and which are project-specific (for graduating to Standards and Skills)
  - **"Lessons"**: the content of both machine-local memory notes, rewritten as rules (e2e only on milestone pushes, slow runner, stale preview server, stacked-PR landing), each with the guard that now enforces it, or "not enforced"
- [ ] **Step 2: CONTRIBUTING.** Add an "Agent workflow" section linking `workflow/README.md`. Add that plans carry a `workflow-tasks` block, checked by `wf check-plan`. Add that PR `ci` now runs e2e. Change the issue lifecycle step 5 to say merges need passing gate and review records when a run exists.
- [ ] **Step 3: Review template.**
  - Replace the M2–M6 milestone-specific blocks in §8 with: "Copy this milestone's Review Focus from its plan and check each line."
  - Move the M2–M6 blocks to an appendix titled "Historical milestone checks".
  - Add to §1: "The final-review comment and the outcome comment are on the PR, and every must-fix is fixed or explicitly deferred."
- [ ] **Step 4: Spec sync.** Update §7's "standard library only" call to "stdlib at runtime, run through `uv` on Python 3.12" with the reason, and record any other deviation made in Tasks 1–9.
- [ ] **Step 5: Roadmap.** Mark M12's work order from the task list, and add the M13 pilot note.
- [ ] **Step 6: Commit:** `docs: agent workflow in CONTRIBUTING, workflow README and review template`.

---

### Task 11: M11 baseline and final-review replay

The orchestrating session runs this task, not an implementer subagent, because Step 4 dispatches a reviewer.

**Files:**
- Create: `workflow/src/wf/baseline.py`, `docs/reviews/2026-11-14-m12-replay-and-baseline.md`
- Modify: `workflow/src/wf/cli.py` (add `baseline`)
- Test: `workflow/tests/test_baseline.py`

**Interfaces:**
- Produces:
  - `Baseline(milestone: int, fix_prs_after_final_review: list[int], red_deploys_after_merge: int, tokens_by_session: dict[str, int], tokens_per_task: float | None, notes: list[str])`
  - `session_tokens(jsonl: Path) -> int` sums `input_tokens + output_tokens + cache_creation_input_tokens` over assistant messages' `message.usage`. It reports `cache_read_input_tokens` separately in `notes` and skips lines it can't parse, counting them in `notes`.
  - `baseline(transcripts_dir: Path, since: str, until: str, gh: Gh, branch: str, task_count: int, fix_prs: list[int]) -> Baseline`
    - It includes sessions whose first timestamp falls in `[since, until)`, and their `subagents/*.jsonl` files if that directory exists.
    - Red deploys come from `gh run list --workflow build-deploy.yml --branch <branch>`.
- CLI: `wf baseline --milestone 11 --since 2026-11-13 --until 2026-11-14T09:00 --branch milestone/m11 --tasks 8 --fix-prs 248,250,251 --transcripts ~/.claude/projects/<this project>`

- [ ] **Step 1: Write the failing test** with a two-line synthetic JSONL

```python
def test_session_tokens_sums_usage_and_skips_bad_lines(tmp_path):
    p = tmp_path / "s.jsonl"
    p.write_text(json.dumps({"type": "assistant", "message": {"usage": {"input_tokens": 10, "output_tokens": 5, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 999}}}) + "\nnot json\n")
    assert session_tokens(p) == 115
```

- [ ] **Step 2: Implement `wf.baseline` and the CLI command, and run all `workflow` checks.**
- [ ] **Step 3: Produce the M11 baseline** with the CLI command above, and write the numbers into the report.
- [ ] **Step 4: Replay.**
  - In a scratch worktree at `544bbf2`, build `wf package final` for range `8960663..544bbf2` against the M11 plan and spec, with an empty throwaway run state.
  - Dispatch `final-review.md` with that package on `opus`.
- [ ] **Step 5: Score the replay.** It **passes** if the verdict contains findings matching:
  - C1 (the map moves or resizes across measures or Show states)
  - I1 (the phone map's top position)
  - I2 (24×24 targets not met)

  For each, record matched / missed, the replay's token count from the task notification, and the original M11 final review's tokens if the baseline found them. If it fails, stop and escalate to the author: the pilot doesn't start until the final-review prompt or package is revised (spec §5.10).
- [ ] **Step 6: Write `docs/reviews/2026-11-14-m12-replay-and-baseline.md`** with both results and the pilot targets they set for M13.
- [ ] **Step 7: Commit:** `chore(workflow): M11 baseline and final-review replay`.

---

## Milestone exit criteria

- `ci` is green on the milestone PR. It now includes `workflow` and `e2e`.
- `build-deploy` is green on `milestone/m12`.
- The replay passes (Task 11), and the baseline numbers are recorded.
- The Task 9 dry run shows a dispatch, an escalation and a pause, each stopping or notifying as specified.
- CONTRIBUTING and `workflow/README.md` describe how to start an M13 run.
