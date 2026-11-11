from __future__ import annotations

import math

import pandas as pd

from pnw_health.model.explain import global_importance, ranked_contributions


def test_ranked_by_absolute_value() -> None:
    contrib = pd.Series({"a": 0.1, "b": -3.0, "c": 2.0})
    values = pd.Series({"a": 1.0, "b": 2.0, "c": 3.0})
    assert [c.feature for c in ranked_contributions(contrib, values)] == ["b", "c", "a"]


def test_ties_break_by_name() -> None:
    contrib = pd.Series({"z": 1.0, "a": -1.0, "m": 1.0})
    values = pd.Series({"z": 1.0, "a": 1.0, "m": 1.0})
    assert [c.feature for c in ranked_contributions(contrib, values)] == ["a", "m", "z"]


def test_imputed_value_is_none() -> None:
    contrib = pd.Series({"a": 0.5, "b": 0.2})
    values = pd.Series({"a": math.nan, "b": 4.0})
    out = {c.feature: c for c in ranked_contributions(contrib, values)}
    assert out["a"].value is None
    assert out["a"].contribution == 0.5
    assert out["b"].value == 4.0


def test_global_importance() -> None:
    frame = pd.DataFrame({"a": [1.0, -3.0], "b": [0.0, 1.0]})
    assert global_importance(frame) == [("a", 2.0), ("b", 0.5)]
