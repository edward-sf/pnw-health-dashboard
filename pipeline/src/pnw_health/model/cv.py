"""State-grouped cross-validation: out-of-fold predictions and metrics.

Every county is predicted by a model that never saw its state, so the scores measure how
well the factors associated with life expectancy transfer to unseen states.
"""

from __future__ import annotations

import random
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from pnw_health.config import state_abbr
from pnw_health.contract import Metrics, RegionMetrics
from pnw_health.model.config import LGBM_PARAMS, N_FOLDS, RIDGE_ALPHA, SEED
from pnw_health.model.features import ModelDataError, impute_fold


@dataclass(frozen=True)
class LgbmOof:
    predicted: pd.Series


def assign_folds(states: Iterable[str], seed: int = SEED, n_folds: int = N_FOLDS) -> dict[str, int]:
    """Map each distinct state to a fold, deterministically and independent of input order."""
    distinct = sorted(set(states))
    if len(distinct) < n_folds:
        raise ModelDataError(f"need at least {n_folds} states, got {len(distinct)}")
    random.Random(seed).shuffle(distinct)
    return {state: i % n_folds for i, state in enumerate(distinct)}


def _oof(
    frame: pd.DataFrame,
    features: Sequence[str],
    folds: dict[str, int],
    make_model: Callable[[], Any],
) -> pd.Series:
    fold_of = frame["state"].map(folds)
    if fold_of.isna().any():
        raise ModelDataError("some states have no fold assignment")
    predicted = pd.Series(np.nan, index=frame.index, dtype=float, name="predicted")
    for fold in sorted(set(folds.values())):
        test_mask = fold_of == fold
        if not test_mask.any():
            continue
        train, test, _ = impute_fold(
            frame.loc[~test_mask, list(features)], frame.loc[test_mask, list(features)]
        )
        model = make_model()
        model.fit(train, frame.loc[~test_mask, "target"])
        predicted[test_mask] = model.predict(test)
    return predicted


def fit_ridge_oof(frame: pd.DataFrame, features: Sequence[str], folds: dict[str, int]) -> pd.Series:
    """Out-of-fold ridge predictions, one held-out fold of states at a time."""
    return _oof(
        frame,
        features,
        folds,
        lambda: make_pipeline(StandardScaler(), Ridge(alpha=RIDGE_ALPHA)),
    )


def fit_lightgbm_oof(
    frame: pd.DataFrame, features: Sequence[str], folds: dict[str, int]
) -> LgbmOof:
    """Out-of-fold LightGBM predictions, one held-out fold of states at a time."""
    return LgbmOof(predicted=_oof(frame, features, folds, lambda: LGBMRegressor(**LGBM_PARAMS)))


def score(actual: pd.Series, predicted: pd.Series) -> Metrics:
    return Metrics(
        rmse=float(root_mean_squared_error(actual, predicted)),
        mae=float(mean_absolute_error(actual, predicted)),
        r2=float(r2_score(actual, predicted)),
        n=len(actual),
    )


def score_regions(frame: pd.DataFrame, predicted: pd.Series) -> RegionMetrics:
    """Score all counties and the Pacific Northwest subset."""
    is_pnw = pd.Series([state_abbr(str(f)) is not None for f in frame.index], index=frame.index)
    actual = frame["target"]
    return RegionMetrics(
        national=score(actual, predicted),
        pnw=score(actual[is_pnw], predicted[is_pnw]),
    )
