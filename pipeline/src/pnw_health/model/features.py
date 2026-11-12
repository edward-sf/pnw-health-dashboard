"""National county feature table and fold-safe median imputation."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import pandas as pd

from pnw_health.errors import PipelineError
from pnw_health.indicators import Indicator
from pnw_health.model.config import ALLOWED_CATEGORIES, BEHAVIORS, FEATURES


class ModelDataError(PipelineError, ValueError):
    """The inputs cannot support the model."""


@dataclass(frozen=True)
class ModelTable:
    """One row per county. ``frame`` is treated as read-only; callers copy before editing."""

    frame: pd.DataFrame
    dropped: tuple[str, ...]


def build_table(
    long: pd.DataFrame,
    features: Sequence[str] = FEATURES,
    behaviors: Sequence[str] = BEHAVIORS,
    *,
    target: str,
) -> ModelTable:
    """Pivot the long table to one row per county.

    Keeps counties with a target and at least one feature. `dropped` lists counties that
    have a target but no feature values; behaviors do not count as features.
    """
    wanted = [*features, *behaviors, target]
    present = set(long["indicator_id"])
    missing = [name for name in wanted if name not in present]
    if missing:
        raise ModelDataError(f"indicators missing from long table: {', '.join(missing)}")

    rows = long[long["indicator_id"].isin(wanted)]
    dupes = rows[rows.duplicated(["fips", "indicator_id"], keep=False)]
    if not dupes.empty:
        keys = sorted({f"{r.fips}/{r.indicator_id}" for r in dupes.itertuples()})
        more = f" and {len(keys) - 10} more" if len(keys) > 10 else ""
        raise ModelDataError(f"duplicate (fips, indicator_id) rows: {', '.join(keys[:10])}{more}")
    wide = rows.pivot(index="fips", columns="indicator_id", values="value").reindex(columns=wanted)
    target_rows = rows[rows["indicator_id"] == target].set_index("fips")
    wide["ci_low"] = target_rows["ci_low"]
    wide["ci_high"] = target_rows["ci_high"]
    wide = wide.rename(columns={target: "target"})

    has_target = wide["target"].notna()
    has_feature = wide[list(features)].notna().any(axis=1)
    dropped = tuple(sorted(wide.index[has_target & ~has_feature].astype(str)))
    frame = wide[has_target & has_feature].sort_index()
    frame = frame[[*features, *behaviors, "target", "ci_low", "ci_high"]].astype(float)
    frame.index = frame.index.astype(str)
    frame.index.name = "fips"
    frame["state"] = frame.index.str[:2]
    return ModelTable(frame=frame, dropped=dropped)


def check_features(features: Sequence[str], catalog: list[Indicator]) -> None:
    """Fail unless every feature is a catalog indicator in an allowed category."""
    by_id = {ind.id: ind for ind in catalog}
    for name in features:
        ind = by_id.get(name)
        if ind is None:
            raise ModelDataError(f"feature {name!r} is not in the indicator catalog")
        if ind.category not in ALLOWED_CATEGORIES:
            raise ModelDataError(
                f"feature {name!r} has category {ind.category!r}; "
                f"allowed: {', '.join(sorted(ALLOWED_CATEGORIES))}"
            )


def check_targets(targets: Sequence[str], catalog: list[Indicator]) -> None:
    """Fail unless every target is a catalog outcome with a CI and a better/worse direction."""
    by_id = {ind.id: ind for ind in catalog}
    for name in targets:
        ind = by_id.get(name)
        if ind is None:
            raise ModelDataError(f"target {name!r} is not in the indicator catalog")
        if ind.category != "Outcomes":
            raise ModelDataError(f"target {name!r} has category {ind.category!r}; need 'Outcomes'")
        if ind.ci_level is None:
            raise ModelDataError(f"target {name!r} has no ci_level; flags need a CI")
        if ind.direction == "neutral":
            raise ModelDataError(f"target {name!r} has direction 'neutral'; flags need a direction")


def impute_fold(
    train: pd.DataFrame, test: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
    """Fill NaN in train and test with the training medians.

    Uses `train.median()` directly: SimpleImputer silently drops all-NaN columns.
    """
    medians = train.median()
    empty = [str(c) for c in medians.index[medians.isna()]]
    if empty:
        raise ModelDataError(f"training fold has no values for: {', '.join(empty)}")
    return train.fillna(medians), test.fillna(medians), medians
