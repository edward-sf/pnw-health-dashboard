import io
import json
from pathlib import Path

import pytest

from wf.cli import main
from wf.config import load_graph, load_project
from wf.schedule import (
    Blocked,
    Dispatch,
    Done,
    Pause,
    TaskGraph,
    TaskInfo,
    TaskNode,
    Usage,
    Window,
    estimate,
    load_task_graph,
    next_decision,
    parse_usage,
    ready_nodes,
    write_task_graph,
)
from wf.state import RunState, UsageSample, finish, init_run, run_dir

REPO = Path(__file__).resolve().parents[2]
G = load_graph(REPO / "workflow/graph.toml")
PACING = load_project(REPO / "workflow/project.toml").pacing
NOW = "2026-11-14T10:00:00Z"
PAST = "2026-11-14T08:00:00Z"
FUTURE = "2026-11-14T15:00:00Z"
TG_REL = "docs/tasks.json"


def run_with(tasks, root=Path("/unused")):
    infos = [TaskInfo(i, n, tuple(d)) for i, n, d in tasks]
    return init_run_mem([t.id for t in infos]), infos


def init_run_mem(ids):
    from wf.state import NodeRecord

    nodes = {}
    for spec in G.nodes.values():
        if spec.per_task:
            nodes.update({f"{t}.{spec.name}": NodeRecord() for t in ids})
        else:
            nodes[spec.name] = NodeRecord()
    return RunState(milestone=13, nodes=nodes)


def seed_samples(s, kind, pct_per_step, n, steps=10):
    for i in range(n):
        s.usage.append(
            UsageSample(f"x{i}.{kind}", kind, steps, 10.0, 10.0 + pct_per_step * steps, None)
        )


def usage(pct, resets, weekly=None):
    return Usage(Window(pct, resets), None if weekly is None else Window(weekly, "W"))


def task_graph(*tasks):
    nodes = {}
    for tid, steps, deps in tasks:
        blocks = tuple(t for t, _, d in tasks if tid in d)
        nodes[tid] = TaskNode(tid, None, tid, steps, tuple(deps), blocks, (), (), None)
    return TaskGraph(13, "plan.md", "spec.md", "abc", tuple(t[0] for t in tasks), nodes)


def mark_done(s, *nodes):
    for n in nodes:
        finish(s, n, "done", NOW)


def test_independent_small_tasks_fill_the_window():
    s, tasks = run_with([("T1", 8, ()), ("T2", 4, ()), ("T3", 2, ())])
    s.window = "R1"
    seed_samples(s, "implement", pct_per_step=0.5, n=3)
    d = next_decision(s, G, tasks, usage(97, "R1"), PACING, NOW)
    assert d == Dispatch("T2.implement", "sonnet", 2.0, "on", "R1")


def test_dependent_task_is_not_ready():
    s, tasks = run_with([("T1", 8, ()), ("T2", 4, ("T1",))])
    assert "T2.implement" not in ready_nodes(s, G, tasks)
    mark_done(s, "T1.implement", "T1.gates", "T1.task-review", "T1.merge")
    assert "T2.implement" not in ready_nodes(s, G, tasks)  # needs deploy-watch
    mark_done(s, "T1.deploy-watch")
    assert "T2.implement" in ready_nodes(s, G, tasks)


def test_readiness_order_and_milestone_nodes():
    s, tasks = run_with([("T1", 1, ()), ("T2", 1, ())])
    assert ready_nodes(s, G, tasks) == ["T1.implement", "T2.implement"]
    mark_done(s, "T1.implement")
    assert ready_nodes(s, G, tasks) == ["T1.gates", "T2.implement"]
    for t in ("T1", "T2"):
        mark_done(s, *(f"{t}.{n}" for n in ("implement", "gates", "task-review", "merge")))
    assert "final-review" not in ready_nodes(s, G, tasks)
    mark_done(s, "T1.deploy-watch", "T2.deploy-watch")
    assert ready_nodes(s, G, tasks) == ["final-review"]


def test_running_and_escalated_nodes_are_never_ready():
    s, tasks = run_with([("T1", 1, ())])
    s.nodes["T1.implement"].status = "running"
    assert ready_nodes(s, G, tasks) == []
    s.nodes["T1.implement"].status = "escalated"
    assert ready_nodes(s, G, tasks) == []


def test_fresh_window_takes_earliest_ready_only():
    s, tasks = run_with([("T1", 8, ()), ("T2", 2, ())])
    s.window = "OLD"
    d = next_decision(s, G, tasks, usage(0, "R2"), PACING, NOW)
    assert isinstance(d, Dispatch) and d.node == "T1.implement"


def test_nothing_fits_pauses_until_reset():
    s, tasks = run_with([("T1", 8, ())])
    s.window = "R1"
    d = next_decision(s, G, tasks, usage(99, "R1"), PACING, NOW)
    assert d == Pause(until="R1", reason="no ready node fits the 5-hour window")


def test_unavailable_usage_dispatches_with_pacing_off():
    s, tasks = run_with([("T1", 8, ())])
    d = next_decision(s, G, tasks, Usage(None, None), PACING, NOW)
    assert isinstance(d, Dispatch) and d.node == "T1.implement" and d.pacing == "off"


def test_reset_in_the_past_counts_as_fresh():
    s, tasks = run_with([("T1", 8, ()), ("T2", 2, ())])
    s.window = PAST
    d = next_decision(s, G, tasks, usage(50, PAST), PACING, NOW)
    assert isinstance(d, Dispatch) and d.node == "T1.implement"


def test_fresh_window_that_cannot_fit_first_node_is_blocked():
    s, tasks = run_with([("T1", 200, ())])
    s.window = "OLD"
    d = next_decision(s, G, tasks, usage(0, FUTURE), PACING, NOW)
    assert isinstance(d, Blocked)
    assert d.escalations[0].reason == "estimate exceeds a full window"


def test_script_nodes_estimate_zero_and_always_fit():
    s, tasks = run_with([("T1", 8, ())])
    s.window = "R1"
    mark_done(s, "T1.implement")
    d = next_decision(s, G, tasks, usage(99.9, "R1"), PACING, NOW)
    assert d == Dispatch("T1.gates", None, 0.0, "on", "R1")


def test_no_ready_nodes_done_or_blocked():
    s, tasks = run_with([("T1", 1, ())])
    for n in s.nodes:
        s.nodes[n].status = "done"
    assert next_decision(s, G, tasks, Usage(None, None), PACING, NOW) == Done()
    s.nodes["retro"].status = "escalated"
    finish(s, "retro", "escalated", NOW, "stuck")
    d = next_decision(s, G, tasks, Usage(None, None), PACING, NOW)
    assert isinstance(d, Blocked) and d.escalations[0].reason == "stuck"


def test_estimate_falls_back_below_min_samples():
    s, _ = run_with([])
    seed_samples(s, "implement", pct_per_step=2.0, n=2)
    assert estimate(s, "implement", 10, PACING) == 5.0


def test_estimate_uses_median_with_enough_samples():
    s, _ = run_with([])
    seed_samples(s, "implement", pct_per_step=2.0, n=3)
    assert estimate(s, "implement", 10, PACING) == 20.0


def test_weekly_window_also_gates():
    s, tasks = run_with([("T1", 2, ())])
    s.window = "R1"
    d = next_decision(s, G, tasks, usage(0, "R1", weekly=99.5), PACING, NOW)
    assert d == Pause(until="W", reason="no ready node fits the weekly window")


def test_parse_usage_real_payload():
    raw = json.loads((Path(__file__).parent / "fixtures/get_usage_ok.json").read_text())
    assert parse_usage(raw) == Usage(
        Window(14, "2026-11-14T21:29:59.821Z"), Window(5, "2026-11-19T04:59:59.821Z")
    )


def test_parse_usage_unavailable_or_unknown_shape():
    assert parse_usage({"plan": {"status": "unavailable"}}) == Usage(None, None)
    assert parse_usage({"status": "ok"}) == Usage(None, None)
    assert parse_usage({"plan": {"status": "ok", "windows": []}}) == Usage(None, None)


def test_task_graph_round_trips_with_reverse_edges(tmp_path):
    g = task_graph(("T1", 8, ()), ("T2", 4, ("T1",)), ("T3", 2, ()))
    write_task_graph(tmp_path / "g.json", g)
    back = load_task_graph(tmp_path / "g.json")
    assert back == g and back.tasks["T1"].blocks == ("T2",)
    assert back.order.index("T1") < back.order.index("T2")
    assert [i.id for i in back.infos()] == ["T1", "T2", "T3"]
    text = (tmp_path / "g.json").read_text()
    assert text == json.dumps(json.loads(text), indent=2, sort_keys=True) + "\n"


# ---------------------------------------------------------------- CLI

OK = {
    "plan": {
        "status": "ok",
        "windows": [{"label": "5-hour limit", "percentUsed": 10, "resetsAt": FUTURE}],
    },
}


def run_on_disk(tmp_path, tg):
    write_task_graph(tmp_path / TG_REL, tg)
    init_run(tmp_path, 13, G, [t for t in tg.order], TG_REL)
    return tmp_path


def cli(root, *args):
    return main(
        [
            "--root", str(root),
            "--graph", str(REPO / "workflow/graph.toml"),
            "--project", str(REPO / "workflow/project.toml"),
            *args,
        ]
    )  # fmt: skip


def test_next_does_not_read_the_plan(tmp_path, monkeypatch, capsys):
    root = run_on_disk(tmp_path, task_graph(("T1", 8, ())))
    (root / "usage.json").write_text(json.dumps(OK))
    real = Path.read_text

    def guard(self, *a, **k):
        assert self.suffix != ".md", f"opened {self}"
        return real(self, *a, **k)

    monkeypatch.setattr(Path, "read_text", guard)
    assert cli(root, "next", "--milestone", "13", "--usage", str(root / "usage.json")) == 0
    assert json.loads(capsys.readouterr().out)["node"] == "T1.implement"


def test_cli_next_reads_usage_from_stdin(tmp_path, monkeypatch, capsys):
    root = run_on_disk(tmp_path, task_graph(("T1", 8, ())))
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(OK)))
    assert cli(root, "next", "--milestone", "13", "--usage", "-") == 0
    out = json.loads(capsys.readouterr().out)
    assert out["decision"] == "dispatch" and out["resets_at"] == FUTURE


def test_start_records_window_from_last_dispatch(tmp_path, monkeypatch, capsys):
    root = run_on_disk(tmp_path, task_graph(("T1", 8, ()), ("T2", 2, ())))
    (root / "usage.json").write_text(json.dumps(OK))
    cli(root, "next", "--milestone", "13", "--usage", str(root / "usage.json"))
    assert (run_dir(root, 13) / "last-decision.json").exists()
    # starting a different node does not adopt the window
    cli(root, "start", "T2.implement", "--milestone", "13")
    cli(root, "status", "--milestone", "13")
    out = capsys.readouterr().out
    assert json.loads(out[out.rindex('{\n  "milestone"') :])["window"] is None
    cli(root, "start", "T1.implement", "--milestone", "13")
    capsys.readouterr()
    cli(root, "status", "--milestone", "13")
    assert json.loads(capsys.readouterr().out)["window"] == FUTURE


def test_next_persists_new_escalation_when_blocked(tmp_path, capsys):
    root = run_on_disk(tmp_path, task_graph(("T1", 200, ())))
    (root / "usage.json").write_text(json.dumps(OK))
    assert cli(root, "next", "--milestone", "13", "--usage", str(root / "usage.json")) == 0
    assert json.loads(capsys.readouterr().out)["decision"] == "blocked"
    cli(root, "status", "--milestone", "13")
    state = json.loads(capsys.readouterr().out)
    assert state["nodes"]["T1.implement"]["status"] == "escalated"


def test_next_without_task_graph_is_a_clean_error(tmp_path, capsys):
    init_run(tmp_path, 13, G, ["T1"])
    (tmp_path / "u.json").write_text(json.dumps(OK))
    assert cli(tmp_path, "next", "--milestone", "13", "--usage", str(tmp_path / "u.json")) == 2
    assert capsys.readouterr().err.startswith("wf: ")


def test_cli_usage_records_sample_used_by_estimate(tmp_path, capsys):
    root = run_on_disk(tmp_path, task_graph(("T1", 10, ())))
    args = ("usage", "T1.implement", "--milestone", "13", "--pct-before", "10", "--pct-after", "15")
    assert cli(root, *args, "--tokens", "900") == 0
    sample = json.loads(capsys.readouterr().out)
    assert sample["kind"] == "implement" and sample["steps"] == 10 and sample["tokens"] == 900
    cli(root, "status", "--milestone", "13")
    assert json.loads(capsys.readouterr().out)["usage"][0]["pct_after"] == 15


@pytest.mark.parametrize("bad", ["not json", "[]"])
def test_next_bad_usage_file_is_a_clean_error(tmp_path, bad, capsys):
    root = run_on_disk(tmp_path, task_graph(("T1", 1, ())))
    (root / "u.json").write_text(bad)
    assert cli(root, "next", "--milestone", "13", "--usage", str(root / "u.json")) == 2
