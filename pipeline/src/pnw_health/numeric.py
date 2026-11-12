"""Small numeric helpers shared by the model and export code."""

from __future__ import annotations

import math

import pandas as pd


def nan_to_none(x: object) -> float | None:
    """``None`` for a missing value (None, ``pd.NA`` or NaN), else ``float(x)``."""
    if x is None or x is pd.NA:
        return None
    f = float(x)  # type: ignore[arg-type]
    return None if math.isnan(f) else f
