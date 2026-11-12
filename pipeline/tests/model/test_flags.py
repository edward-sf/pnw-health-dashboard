from __future__ import annotations

import math

import pandas as pd
import pytest

from pnw_health.model.config import Z_75, Z_90
from pnw_health.model.flags import classify, se_from_ci, sigma_model_sq

NAN = float("nan")


def test_se_from_ci() -> None:
    se = se_from_ci(pd.Series([76.04]), pd.Series([79.96]))
    assert se.iloc[0] == pytest.approx(1.0)


def test_se_from_ci_missing_bound_is_nan() -> None:
    se = se_from_ci(pd.Series([NAN, 70.0]), pd.Series([80.0, NAN]))
    assert se.isna().all()


def test_sigma_hand_computed() -> None:
    assert sigma_model_sq(pd.Series([2.0, -2.0]), pd.Series([1.0, 1.0])) == pytest.approx(3.0)


def test_sigma_floor_at_zero() -> None:
    assert sigma_model_sq(pd.Series([1.0, -1.0]), pd.Series([2.0, 2.0])) == 0.0


def test_sigma_mean_ignores_missing_ci() -> None:
    residuals = pd.Series([3.0, -3.0, 3.0, -3.0])
    se = pd.Series([1.0, NAN, 3.0, NAN])
    assert sigma_model_sq(residuals, se) == pytest.approx(4.0)


def test_tiers() -> None:
    scale = 3.0  # sqrt(sigma_sq + se**2) with se = 0
    above_90, above_75, below_75 = (
        scale * (Z_90 + 0.01),
        scale * (Z_75 + 0.01),
        scale * (Z_75 - 0.01),
    )
    residuals = pd.Series([above_90, -above_90, above_75, -above_75, below_75])
    se = pd.Series([0.0] * 5)
    flags = classify(residuals, se, sigma_sq=scale**2, mean_se_sq=0.0)
    assert list(flags.flag) == [
        "notably_better",
        "notably_worse",
        "somewhat_better",
        "somewhat_worse",
        "none",
    ]


def test_exactly_on_threshold_is_lower_tier() -> None:
    residuals = pd.Series([Z_75 * 3.0, Z_90 * 3.0])
    flags = classify(residuals, pd.Series([0.0, 0.0]), sigma_sq=9.0, mean_se_sq=0.0)
    assert list(flags.flag) == ["none", "somewhat_better"]


def test_own_uncertainty_widens_threshold() -> None:
    flags = classify(pd.Series([0.0]), pd.Series([4.0]), sigma_sq=9.0, mean_se_sq=0.0)
    assert flags.se_sq.iloc[0] == pytest.approx(16.0)
    assert flags.threshold_90.iloc[0] == pytest.approx(1.645 * 5)
    assert flags.threshold_75.iloc[0] == pytest.approx(1.150 * 5)


def test_missing_ci_uses_mean() -> None:
    flags = classify(pd.Series([0.0]), pd.Series([NAN]), sigma_sq=9.0, mean_se_sq=16.0)
    assert flags.se_sq.iloc[0] == pytest.approx(16.0)
    assert flags.threshold_90.iloc[0] == pytest.approx(1.645 * 5)


def test_null_residual_is_insufficient_data() -> None:
    residuals = pd.Series([NAN, 5.0], index=["a", "b"])
    flags = classify(residuals, pd.Series([0.0, 0.0], index=["a", "b"]), 9.0, 0.0)
    assert flags.flag["a"] == "insufficient_data"
    assert flags.flag["b"] == "notably_better"
    assert not math.isnan(flags.threshold_90["a"])


def test_shuffled_index_same_flags() -> None:
    index = pd.Index([f"c{i}" for i in range(6)])
    residuals = pd.Series([5.0, -5.0, 4.0, -4.0, 3.0, NAN], index=index)
    se = pd.Series([0.0, 1.0, NAN, 0.5, 0.0, 0.0], index=index)
    base = classify(residuals, se, sigma_sq=9.0, mean_se_sq=0.25).flag
    order = index[[3, 0, 5, 1, 4, 2]]
    shuffled = classify(residuals[order], se[order], sigma_sq=9.0, mean_se_sq=0.25).flag
    pd.testing.assert_series_equal(shuffled.loc[index], base)


def test_zero_residuals_are_none() -> None:
    flags = classify(pd.Series([0.0] * 4), pd.Series([0.0, 1.0, NAN, 2.0]), 0.0, 1.0)
    assert set(flags.flag) == {"none"}
