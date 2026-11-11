"""Compare the main model with one that also uses the behavior measures.

Both models are trained and scored on the same counties, so any difference in scores
reflects the behavior measures and not a different set of places.
"""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd

from pnw_health.contract import BehaviorsComparison, ExcludedState, RegionMetrics
from pnw_health.model.cv import fit_lightgbm_oof, score_regions

EXCLUSION_REASON = "PLACES does not report these behavior measures for this state's counties."


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
    incomplete = frame.loc[~frame.index.isin(shared.index), "state"]
    excluded = [
        ExcludedState(state_fips=str(state), counties=int(count), reason=EXCLUSION_REASON)
        for state, count in sorted(incomplete.value_counts().items())
    ]
    return BehaviorsComparison(
        main=_score(shared, features, folds),
        behaviors=_score(shared, [*features, *behaviors], folds),
        excluded_states=excluded,
    )
