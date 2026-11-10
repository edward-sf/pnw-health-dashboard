"""Direction-aware county ranks (1 = best)."""

from __future__ import annotations

import pandas as pd

from pnw_health.config import state_abbr
from pnw_health.indicators import Indicator


def add_ranks(values: pd.DataFrame, catalog: list[Indicator]) -> pd.DataFrame:
    """Add nullable ``rank`` and ``state_rank`` columns.

    Ties share the best rank (competition ranking). Null values and neutral
    indicators are unranked.
    """
    out = values.copy()
    out["rank"] = pd.Series(pd.NA, index=out.index, dtype="Int64")
    out["state_rank"] = pd.Series(pd.NA, index=out.index, dtype="Int64")
    state = out["fips"].map(state_abbr)
    for ind in catalog:
        if ind.direction == "neutral":
            continue
        ascending = ind.direction == "higher_is_worse"
        mask = (out["indicator_id"] == ind.id) & out["value"].notna()
        vals = out.loc[mask, "value"]
        out.loc[mask, "rank"] = vals.rank(method="min", ascending=ascending).astype("Int64")
        out.loc[mask, "state_rank"] = (
            vals.groupby(state[mask]).rank(method="min", ascending=ascending).astype("Int64")
        )
    return out
