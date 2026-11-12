from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from pnw_health.contract import BehaviorsComparison
from pnw_health.model import compare
from pnw_health.model.compare import (
    EXCLUSION_REASON_ALL,
    EXCLUSION_REASON_SOME,
    compare_behaviors,
)
from pnw_health.model.config import BEHAVIORS, FEATURES, TARGETS
from pnw_health.model.cv import assign_folds
from pnw_health.model.features import ModelDataError, build_table
from tests.model.synthetic import make_long


def _frame() -> pd.DataFrame:
    return build_table(make_long(), target=TARGETS[0]).frame


def _blank_state(frame: pd.DataFrame, state: str) -> pd.DataFrame:
    frame = frame.copy()
    frame.loc[frame["state"] == state, list(BEHAVIORS)] = np.nan
    return frame


def _compare(frame: pd.DataFrame) -> BehaviorsComparison:
    folds = assign_folds(frame["state"])
    return compare_behaviors(frame, FEATURES, BEHAVIORS, folds)


def test_models_use_identical_counties() -> None:
    result = _compare(_blank_state(_frame(), "06"))
    assert result.main.national.n == result.behaviors.national.n
    assert result.main.national.n == (_frame()["state"] != "06").sum()
    assert [s.state_fips for s in result.excluded_states] == ["06"]


def test_excluded_state_reported() -> None:
    frame = _blank_state(_frame(), "06")
    # Part of 36 only: 36 is alone in its fold, and an emptied fold is an error.
    frame.loc[frame.index[frame["state"] == "36"][:10], BEHAVIORS[0]] = np.nan
    result = _compare(frame)
    by_state = {s.state_fips: s for s in result.excluded_states}
    assert list(by_state) == ["06", "36"]
    assert by_state["06"].counties == (frame["state"] == "06").sum()
    assert all(s.reason for s in result.excluded_states)


def test_nothing_excluded_when_complete() -> None:
    assert _compare(_frame()).excluded_states == []


def test_output_has_no_predictions() -> None:
    assert set(BehaviorsComparison.model_fields) == {"main", "behaviors", "excluded_states"}


def test_behaviors_model_receives_behavior_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[list[str]] = []
    real = compare.fit_lightgbm_oof

    def spy(frame: pd.DataFrame, features: list[str], folds: dict[str, int]) -> object:
        seen.append(list(features))
        return real(frame, features, folds)

    monkeypatch.setattr(compare, "fit_lightgbm_oof", spy)
    _compare(_frame())
    assert seen == [list(FEATURES), [*FEATURES, *BEHAVIORS]]


def test_all_counties_excluded_raises() -> None:
    frame = _frame()
    frame[list(BEHAVIORS)] = np.nan
    with pytest.raises(ModelDataError, match="no county"):
        _compare(frame)


def test_empty_fold_after_exclusion_raises() -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    for state in [s for s, f in folds.items() if f == 0]:
        frame = _blank_state(frame, state)
    with pytest.raises(ModelDataError, match="fold 0"):
        compare_behaviors(frame, FEATURES, BEHAVIORS, folds)


def test_partial_exclusion_reason() -> None:
    frame = _blank_state(_frame(), "06")
    one = frame.index[frame["state"] == "36"][0]
    frame.loc[one, BEHAVIORS[0]] = np.nan
    by_state = {s.state_fips: s.reason for s in _compare(frame).excluded_states}
    assert by_state == {"06": EXCLUSION_REASON_ALL, "36": EXCLUSION_REASON_SOME}
