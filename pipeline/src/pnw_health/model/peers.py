"""Nearest-neighbour peer counties on standardized social and economic features."""

from __future__ import annotations

import numpy as np
import pandas as pd

from pnw_health.model.config import PEER_K, PEER_MIN_FEATURES


def find_peers(
    table: pd.DataFrame, k: int = PEER_K, min_features: int = PEER_MIN_FEATURES
) -> dict[str, list[str]]:
    """The ``k`` nearest counties for every county in ``table``, nearest first.

    ``table`` has one row per county (indexed by FIPS) and one column per feature. A county
    with fewer than ``min_features`` non-null features gets no peers and is nobody's peer;
    it is also left out of the medians and z-scores. Other counties have missing features
    filled with the column median, then every column is standardized, so a constant column
    becomes zero. Distances are Euclidean; ties go to the lower FIPS.
    """
    table = table.sort_index()
    eligible = table.notna().sum(axis=1) >= min_features
    pool = table[eligible]
    filled = pool.fillna(pool.median())
    std = filled.std(ddof=0)
    scaled = (filled - filled.mean()) / std.where(std > 0, 1.0)
    points = scaled.to_numpy(dtype=float)
    distances = np.sqrt(((points[:, None, :] - points[None, :, :]) ** 2).sum(axis=2))

    fips = [str(f) for f in pool.index]
    result: dict[str, list[str]] = {str(f): [] for f in table.index}
    for i, county in enumerate(fips):
        others = sorted(
            (j for j in range(len(fips)) if j != i), key=lambda j: (distances[i, j], fips[j])
        )
        result[county] = [fips[j] for j in others[:k]]
    return result
