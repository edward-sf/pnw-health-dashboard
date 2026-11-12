from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from pnw_health.model import cv
from pnw_health.model.config import BEHAVIORS, FEATURES, N_FOLDS
from pnw_health.model.cv import (
    assign_folds,
    fit_lightgbm_oof,
    fit_ridge_oof,
    score,
    score_regions,
)
from pnw_health.model.features import ModelDataError, build_table
from tests.model.synthetic import make_long

ALL_FEATURES = [*FEATURES, *BEHAVIORS]


def _frame() -> pd.DataFrame:
    return build_table(make_long()).frame


def test_every_state_gets_one_fold() -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    assert set(folds) == set(frame["state"])
    assert all(v in range(N_FOLDS) for v in folds.values())
    assert set(folds.values()) == set(range(N_FOLDS))


def test_same_seed_same_folds() -> None:
    states = _frame()["state"]
    assert assign_folds(states, seed=7) == assign_folds(states, seed=7)


def test_input_order_does_not_change_folds() -> None:
    states = list(_frame()["state"].unique())
    assert assign_folds(states) == assign_folds(reversed(states))


def test_fewer_states_than_folds_fails() -> None:
    with pytest.raises(ModelDataError, match="at least 5 states"):
        assign_folds(["53", "41", "16", "02"])


def test_oof_never_trains_on_own_state() -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    base = fit_ridge_oof(frame, ALL_FEATURES, folds)
    shifted = frame.copy()
    in_state = shifted["state"] == "53"
    shifted.loc[in_state, "target"] += 100.0
    after = fit_ridge_oof(shifted, ALL_FEATURES, folds)
    pd.testing.assert_series_equal(base[in_state], after[in_state])
    assert not base[~in_state].equals(after[~in_state])


@pytest.mark.parametrize("model", ["ridge", "lightgbm"])
def test_predictions_cover_every_county(model: str) -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    if model == "ridge":
        predicted = fit_ridge_oof(frame, ALL_FEATURES, folds)
    else:
        predicted = fit_lightgbm_oof(frame, ALL_FEATURES, folds).predicted
    assert predicted.index.equals(frame.index)
    assert not predicted.isna().any()


def test_lightgbm_is_deterministic() -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    first = fit_lightgbm_oof(frame, ALL_FEATURES, folds).predicted
    second = fit_lightgbm_oof(frame, ALL_FEATURES, folds).predicted
    pd.testing.assert_series_equal(first, second, check_exact=True)


def test_row_order_does_not_change_predictions() -> None:
    long = make_long()
    frame = build_table(long).frame
    shuffled = build_table(long.sample(frac=1, random_state=1)).frame
    folds = assign_folds(frame["state"])
    pd.testing.assert_series_equal(
        fit_ridge_oof(frame, ALL_FEATURES, folds),
        fit_ridge_oof(shuffled, ALL_FEATURES, folds),
        check_exact=True,
    )
    pd.testing.assert_series_equal(
        fit_lightgbm_oof(frame, ALL_FEATURES, folds).predicted,
        fit_lightgbm_oof(shuffled, ALL_FEATURES, folds).predicted,
        check_exact=True,
    )


def test_score_hand_computed() -> None:
    m = score(pd.Series([1.0, 2.0, 3.0]), pd.Series([1.0, 2.0, 5.0]))
    assert m.rmse == pytest.approx(math.sqrt(4 / 3))
    assert m.mae == pytest.approx(2 / 3)
    assert m.r2 == pytest.approx(-1.0)
    assert m.n == 3


def test_score_regions_splits_pnw() -> None:
    frame = _frame()
    predicted = frame["target"] + 1.0
    regions = score_regions(frame, predicted)
    assert regions.national.n == len(frame)
    assert regions.pnw.n == int(frame["state"].isin(["53", "41", "16", "02"]).sum())
    assert regions.pnw.mae == pytest.approx(1.0)


def test_additivity() -> None:
    frame = _frame()
    oof = fit_lightgbm_oof(frame, ALL_FEATURES, assign_folds(frame["state"]))
    total = oof.base_value + oof.contributions.sum(axis=1)
    assert oof.contributions.index.equals(frame.index)
    assert list(oof.contributions.columns) == ALL_FEATURES
    assert total.to_numpy() == pytest.approx(oof.predicted.to_numpy(), abs=1e-6)


def test_base_value_comes_from_own_fold() -> None:
    frame = _frame()
    oof = fit_lightgbm_oof(frame, ALL_FEATURES, assign_folds(frame["state"]))
    assert oof.base_value.nunique() > 1


STATES = sorted(set(make_long()["fips"].str[:2]))


@pytest.mark.parametrize("state", STATES)
def test_explanation_ignores_own_state_target(state: str) -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    base = fit_lightgbm_oof(frame, ALL_FEATURES, folds)
    shifted = frame.copy()
    in_state = shifted["state"] == state
    shifted.loc[in_state, "target"] += 100.0
    after = fit_lightgbm_oof(shifted, ALL_FEATURES, folds)
    pd.testing.assert_frame_equal(base.contributions[in_state], after.contributions[in_state])
    pd.testing.assert_series_equal(base.base_value[in_state], after.base_value[in_state])


def _missing_and_prefilled() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, int], str]:
    frame = _frame()
    folds = assign_folds(frame["state"])
    fold_of = frame["state"].map(folds)
    county = "53001"
    cols = ["poverty_rate", "median_household_income", "percent_rural"]
    missing = frame.copy()
    missing.loc[county, cols] = np.nan
    prefilled = missing.copy()
    train = fold_of != fold_of[county]
    prefilled.loc[county, cols] = frame.loc[train, cols].median()
    return missing, prefilled, folds, county


def test_additivity_with_missing_values() -> None:
    missing, _, folds, _ = _missing_and_prefilled()
    oof = fit_lightgbm_oof(missing, ALL_FEATURES, folds)
    total = oof.base_value + oof.contributions.sum(axis=1)
    assert total.to_numpy() == pytest.approx(oof.predicted.to_numpy(), abs=1e-6)


def test_missing_values_are_explained_as_training_medians() -> None:
    missing, prefilled, folds, county = _missing_and_prefilled()
    a = fit_lightgbm_oof(missing, ALL_FEATURES, folds)
    b = fit_lightgbm_oof(prefilled, ALL_FEATURES, folds)
    pd.testing.assert_series_equal(a.contributions.loc[county], b.contributions.loc[county])
    assert a.predicted[county] == b.predicted[county]


def _fit(model: str, frame: pd.DataFrame, folds: dict[str, int]) -> pd.Series:
    if model == "ridge":
        return fit_ridge_oof(frame, ALL_FEATURES, folds)
    return fit_lightgbm_oof(frame, ALL_FEATURES, folds).predicted


@pytest.mark.parametrize("model", ["ridge", "lightgbm"])
def test_feature_leakage_within_held_out_fold(model: str) -> None:
    """Rows held out together must not influence each other's predictions.

    Every other fold trains on the changed state, so its predictions are meant to change;
    the leak to rule out is through the held-out rows (imputation or scaling fitted on
    them), which only the changed state's fold-mates would show.
    """
    frame = _frame()
    folds = assign_folds(frame["state"])
    mates_of = {s: [t for t, f in folds.items() if f == folds[s] and t != s] for s in folds}
    state = next(s for s in sorted(folds) if mates_of[s])
    # Some fold-mates miss a feature the changed state scales, so imputation fitted on the
    # held-out rows would move their filled-in values.
    mates = frame["state"].isin(mates_of[state])
    frame.loc[frame.index[mates][:5], ALL_FEATURES[1]] = np.nan
    changed = frame.copy()
    rows = changed["state"] == state
    changed.loc[rows, ALL_FEATURES[0]] = np.nan
    changed.loc[rows, ALL_FEATURES[1:]] *= 10.0

    before, after = _fit(model, frame, folds), _fit(model, changed, folds)
    pd.testing.assert_series_equal(before[mates], after[mates], check_exact=True)
    assert not before[rows].equals(after[rows])
    trains_on_state = frame["state"].map(folds) != folds[state]
    assert not before[trains_on_state].equals(after[trains_on_state])


def test_unmapped_state_raises() -> None:
    frame = _frame()
    folds = assign_folds(frame["state"])
    folds.pop(sorted(folds)[0])
    with pytest.raises(ModelDataError, match="no fold assignment"):
        cv._oof(frame, ALL_FEATURES, folds, lambda: None)


def test_contribution_belongs_to_its_feature() -> None:
    frame = _frame()
    rng = np.random.default_rng(1)
    frame["target"] = 78.0 + 2.0 * (frame["poverty_rate"] - 50.0) + rng.normal(0, 0.1, len(frame))
    contributions = fit_lightgbm_oof(frame, FEATURES, assign_folds(frame["state"])).contributions
    assert contributions.abs().mean().idxmax() == "poverty_rate"
    assert (contributions.abs().idxmax(axis=1) == "poverty_rate").mean() >= 0.9
