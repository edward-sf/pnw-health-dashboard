"""Rank the factors associated with a county's out-of-fold prediction."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class Contribution:
    feature: str
    value: float | None
    contribution: float


def ranked_contributions(contributions: pd.Series, values: pd.Series) -> list[Contribution]:
    """Every feature by absolute contribution, largest first, ties by feature name.

    ``value`` is None where the county's feature value was missing (and so imputed).
    """
    ranked = [
        Contribution(
            feature=str(name),
            value=None if pd.isna(values[str(name)]) else float(values[str(name)]),
            contribution=float(contrib),
        )
        for name, contrib in contributions.items()
    ]
    return sorted(ranked, key=lambda c: (-abs(c.contribution), c.feature))


def global_importance(contributions: pd.DataFrame) -> list[tuple[str, float]]:
    """Mean absolute contribution per feature, largest first, ties by feature name."""
    means = contributions.abs().mean()
    return sorted(((str(k), float(v)) for k, v in means.items()), key=lambda t: (-t[1], t[0]))
