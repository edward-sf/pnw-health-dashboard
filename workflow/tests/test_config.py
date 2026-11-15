from pathlib import Path

import pytest

from wf.config import ConfigError, Pacing, load_graph, load_project

REPO = Path(__file__).resolve().parents[2]

GRAPH_WITH_BAD_AFTER = """
[tiers]
mid = "sonnet"

[nodes.a]
kind = "agent"
per_task = true
tier = "mid"
after = ["nope"]
"""

GRAPH_WITH_BAD_TIER = """
[tiers]
mid = "sonnet"

[nodes.a]
kind = "agent"
per_task = true
tier = "huge"
after = []
"""

GRAPH_MISSING_KEY = """
[tiers]
mid = "sonnet"

[nodes.a]
kind = "agent"
after = []
"""


def test_graph_loads_budgets_and_tiers():
    g = load_graph(REPO / "workflow/graph.toml")
    assert g.nodes["implement"].budget == 3 and g.nodes["implement"].per_task
    assert g.nodes["task-review"].budget == 2
    assert g.nodes["final-review"].budget == 1
    assert g.nodes["batched-fix"].budget == 2
    assert g.model_for("final-review") == "opus"
    assert g.model_for("task-review") == "sonnet"
    assert g.nodes["merge"].kind == "script"
    assert g.model_for("merge") is None


def test_graph_rejects_unknown_after(tmp_path):
    p = tmp_path / "g.toml"
    p.write_text(GRAPH_WITH_BAD_AFTER)
    with pytest.raises(ConfigError, match="unknown node 'nope'"):
        load_graph(p)


def test_graph_rejects_unknown_tier(tmp_path):
    p = tmp_path / "g.toml"
    p.write_text(GRAPH_WITH_BAD_TIER)
    with pytest.raises(ConfigError, match="unknown tier 'huge'"):
        load_graph(p)


def test_graph_rejects_missing_key(tmp_path):
    p = tmp_path / "g.toml"
    p.write_text(GRAPH_MISSING_KEY)
    with pytest.raises(ConfigError, match="missing key 'per_task'"):
        load_graph(p)


def test_project_pacing_defaults():
    p = load_project(REPO / "workflow/project.toml")
    assert p.pacing == Pacing(margin=1.5, min_samples=3, default_pct_per_step=0.5)
    assert p.milestone_branch.format(n=12) == "milestone/m12"
    assert set(p.areas) == {"pipeline", "web", "workflow"}
    assert p.areas["web"].paths == ("web/",)
    assert p.e2e.repeat_each == 3


def test_project_rejects_missing_key(tmp_path):
    p = tmp_path / "p.toml"
    p.write_text('repo = "x"\n')
    with pytest.raises(ConfigError, match="missing key"):
        load_project(p)
