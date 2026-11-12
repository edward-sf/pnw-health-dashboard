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
    """Out-of-fold predictions with the SHAP contributions of the fold model behind each one.

    For every county, ``base_value`` plus its row of ``contributions`` equals ``predicted``.
    """

    predicted: pd.Series
    contributions: pd.DataFrame
    base_value: pd.Series


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
    on_fold: Callable[[Any, pd.DataFrame, pd.Index], None] | None = None,
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
        if on_fold is not None:
            on_fold(model, test, frame.index[test_mask])
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
    """Out-of-fold LightGBM predictions and the factors associated with each one.

    Each county is explained by the fold model that predicted it, on the same imputed
    held-out rows, so no explanation has seen its own county's life expectancy.
    """
    columns = list(features)
    parts: list[pd.DataFrame] = []
    bases: list[pd.Series] = []

    def explain(model: Any, test: pd.DataFrame, index: pd.Index) -> None:
        raw = np.asarray(model.predict(test, pred_contrib=True), dtype=float)
        parts.append(pd.DataFrame(raw[:, :-1], index=index, columns=columns))
        bases.append(pd.Series(raw[:, -1], index=index))

    predicted = _oof(frame, features, folds, lambda: LGBMRegressor(**LGBM_PARAMS), explain)
    contributions = pd.concat(parts).reindex(frame.index)
    base_value = pd.concat(bases).reindex(frame.index).rename("base_value")
    return LgbmOof(predicted=predicted, contributions=contributions, base_value=base_value)


def score(actual: pd.Series, predicted: pd.Series) -> Metrics:
    """Metrics for ``predicted`` against ``actual``, matched on the index."""
    if len(actual) < 2:
        raise ModelDataError(f"scoring needs at least 2 counties, got {len(actual)}")
    missing = actual.index.difference(predicted.index)
    if len(missing):
        raise ModelDataError(f"no prediction for: {', '.join(map(str, missing[:10]))}")
    predicted = predicted.reindex(actual.index)
    for name, series in (("actual", actual), ("predicted", predicted)):
        blank = series.index[series.isna()]
        if len(blank):
            raise ModelDataError(f"{name} is NaN for: {', '.join(map(str, blank[:10]))}")
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
