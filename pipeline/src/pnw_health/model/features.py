"""National county feature table and fold-safe median imputation."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import pandas as pd

from pnw_health.indicators import Indicator
from pnw_health.model.config import ALLOWED_CATEGORIES, BEHAVIORS, FEATURES, TARGET


class ModelDataError(ValueError):
    """The inputs cannot support the model."""


@dataclass(frozen=True)
class ModelTable:
    frame: pd.DataFrame
    dropped: list[str]


def build_table(
    long: pd.DataFrame,
    features: Sequence[str] = FEATURES,
    behaviors: Sequence[str] = BEHAVIORS,
    target: str = TARGET,
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
    wide = rows.pivot(index="fips", columns="indicator_id", values="value").reindex(columns=wanted)
    target_rows = rows[rows["indicator_id"] == target].set_index("fips")
    wide["ci_low"] = target_rows["ci_low"]
    wide["ci_high"] = target_rows["ci_high"]
    wide = wide.rename(columns={target: "target"})

    has_target = wide["target"].notna()
    has_feature = wide[list(features)].notna().any(axis=1)
    dropped = sorted(wide.index[has_target & ~has_feature].astype(str))
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
