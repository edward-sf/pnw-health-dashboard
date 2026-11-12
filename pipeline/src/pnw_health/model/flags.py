"""Tiered flags: how far a county sits from its expected value, given noise.

A county is flagged only when its residual exceeds what sampling error in its
own estimate plus model error would produce. A positive residual means the
county is doing better than expected from the factors associated with it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pnw_health.model.config import Z_75, Z_90
from pnw_health.model.features import ModelDataError

CI_Z = 1.96


@dataclass(frozen=True)
class Flags:
    se_sq: pd.Series
    threshold_75: pd.Series
    threshold_90: pd.Series
    flag: pd.Series


def se_from_ci(ci_low: pd.Series, ci_high: pd.Series) -> pd.Series:
    """Standard error implied by a 95% interval; NaN when a bound is missing."""
    return (ci_high - ci_low) / (2 * CI_Z)


def sigma_model_sq(residuals: pd.Series, se: pd.Series) -> float:
    """Model variance: residual variance less mean sampling variance, floored at 0."""
    if se.isna().all():
        raise ModelDataError("no standard errors: cannot compute sigma")
    value = float(residuals.var(ddof=0) - (se**2).mean())
    return max(value, 0.0)


def classify(residuals: pd.Series, se: pd.Series, sigma_sq: float, mean_se_sq: float) -> Flags:
    """Assign tiers; `mean_se_sq` stands in for counties with no CI."""
    se_sq = (se**2).fillna(mean_se_sq)
    scale = np.sqrt(sigma_sq + se_sq)
    t75 = Z_75 * scale
    t90 = Z_90 * scale
    magnitude = residuals.abs()
    better = residuals > 0

    tier = np.select(
        [residuals.isna(), magnitude > t90, magnitude > t75],
        [
            "insufficient_data",
            np.where(better, "notably_better", "notably_worse"),
            np.where(better, "somewhat_better", "somewhat_worse"),
        ],
        default="none",
    )
    flag = pd.Series(tier, index=residuals.index, dtype=object)
    return Flags(se_sq=se_sq, threshold_75=t75, threshold_90=t90, flag=flag)
