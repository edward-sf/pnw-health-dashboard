"""Synthetic long-format data for the model tests."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from pnw_health.long import LONG_COLUMNS
from pnw_health.model.config import BEHAVIORS, FEATURES, TARGETS

INTERCEPTS = dict(zip(TARGETS, (78.0, 7000.0, 80.0, 7.0), strict=True))


def make_long(
    states: Sequence[str] = ("53", "41", "16", "02", "06", "36", "12"),
    per_state: int = 30,
    seed: int = 0,
    targets: Sequence[str] = TARGETS,
) -> pd.DataFrame:
    """Long table with every feature and behavior plus each target linear in the features."""
    rng = np.random.default_rng(seed)
    fips = [f"{st}{2 * i + 1:03d}" for st in states for i in range(per_state)]
    n = len(fips)
    cols = {name: rng.normal(50.0, 10.0, n) for name in (*FEATURES, *BEHAVIORS)}
    coefs = np.linspace(-0.2, 0.2, len(FEATURES))
    signal = sum(c * (cols[f] - 50.0) for c, f in zip(coefs, FEATURES, strict=True))
    outcomes = {t: INTERCEPTS[t] + signal + rng.normal(0.0, 0.5, n) for t in targets}
    frames = []
    for name, values in {**cols, **outcomes}.items():
        is_target = name in outcomes
        frames.append(
            pd.DataFrame(
                {
                    "fips": fips,
                    "indicator_id": name,
                    "year": 2024,
                    "value": values,
                    "ci_low": values - 1.0 if is_target else np.nan,
                    "ci_high": values + 1.0 if is_target else np.nan,
                    "source": "chr" if is_target else "acs",
                    "unreliable": False,
                }
            )
        )
    return pd.concat(frames, ignore_index=True)[LONG_COLUMNS]
