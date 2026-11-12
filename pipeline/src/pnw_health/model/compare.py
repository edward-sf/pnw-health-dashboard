"""Compare the main model with one that also uses the behavior measures.

Both models are trained and scored on the same counties, so any difference in scores
reflects the behavior measures and not a different set of places.
"""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd

from pnw_health.contract import BehaviorsComparison, ExcludedState, RegionMetrics
from pnw_health.model.cv import fit_lightgbm_oof, score_regions
from pnw_health.model.features import ModelDataError

EXCLUSION_REASON_ALL = "PLACES does not report these behavior measures for this state's counties."
EXCLUSION_REASON_SOME = (
    "PLACES is missing some of these behavior measures for this state's counties."
)


def _score(frame: pd.DataFrame, features: Sequence[str], folds: dict[str, int]) -> RegionMetrics:
    return score_regions(frame, fit_lightgbm_oof(frame, features, folds).predicted)


def compare_behaviors(
    frame: pd.DataFrame,
    features: Sequence[str],
    behaviors: Sequence[str],
    folds: dict[str, int],
) -> BehaviorsComparison:
    """Score the main model and the main-plus-behaviors model on counties with every behavior."""
    shared = frame.dropna(subset=list(behaviors))
    if shared.empty:
        raise ModelDataError("behaviors comparison: no county has every behavior measure")
    empty_folds = sorted(set(folds.values()) - set(shared["state"].map(folds)))
    if empty_folds:
        names = ", ".join(f"fold {f}" for f in empty_folds)
        raise ModelDataError(f"behaviors comparison: no county with every measure in {names}")
    incomplete = frame.loc[~frame.index.isin(shared.index)]
    excluded = []
    for state, rows in sorted(incomplete.groupby("state")):
        everything_missing = len(rows) == (frame["state"] == state).sum() and bool(
            rows[list(behaviors)].isna().all().all()
        )
        excluded.append(
            ExcludedState(
                state_fips=str(state),
                counties=len(rows),
                reason=EXCLUSION_REASON_ALL if everything_missing else EXCLUSION_REASON_SOME,
            )
        )
    return BehaviorsComparison(
        main=_score(shared, features, folds),
        behaviors=_score(shared, [*features, *behaviors], folds),
        excluded_states=excluded,
    )
