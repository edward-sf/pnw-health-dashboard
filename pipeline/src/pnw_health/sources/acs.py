"""Census ACS 5-year Data Profile, fetched nationally and parsed to the long format."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from pnw_health.config import ACS_YEAR
from pnw_health.fetch import cached_get
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS

PROFILE_URL = "https://api.census.gov/data/{year}/acs/acs5/profile"
MAX_FIELDS = 49  # Census allows 50 variables per request, including NAME

# Census annotation values meaning "not available / not applicable / too few samples".
CENSUS_SENTINELS: frozenset[float] = frozenset(
    {-111111111, -222222222, -333333333, -555555555, -666666666, -888888888, -999999999}
)


def profile_url(year: int = ACS_YEAR) -> str:
    return PROFILE_URL.format(year=year)


def _fields(catalog: list[Indicator]) -> list[str]:
    fields: list[str] = []
    for ind in catalog:
        if ind.source != "acs":
            continue
        fields.append(ind.source_field)
        if ind.moe_field:
            fields.append(ind.moe_field)
    return fields


def fetch_acs(
    client: httpx.Client,
    raw_dir: Path,
    catalog: list[Indicator],
    *,
    year: int = ACS_YEAR,
    api_key: str | None = None,
    refresh: bool = False,
) -> Path:
    """Fetch every catalog ACS field for all US counties in a single request."""
    fields = _fields(catalog)
    if len(fields) > MAX_FIELDS:
        raise ValueError(
            f"{len(fields)} ACS fields + NAME exceeds the Census limit of 50 variables per request"
        )
    params = {"get": ",".join(["NAME", *fields]), "for": "county:*"}
    if api_key:
        params["key"] = api_key
    dest = raw_dir / "acs" / f"acs5_profile_{year}.json"
    return cached_get(client, profile_url(year), dest, params=params, refresh=refresh)


def _numeric(col: pd.Series) -> pd.Series:
    values = pd.to_numeric(col, errors="coerce").astype("float64")
    return values.mask(values.isin(CENSUS_SENTINELS), np.nan)


def parse_acs(path: Path, catalog: list[Indicator]) -> pd.DataFrame:
    """One long-format row per county x ACS indicator; sentinels and junk become NaN."""
    header, *rows = json.loads(path.read_text())
    table = pd.DataFrame(rows, columns=header, dtype="object")
    fips = table["state"].astype(str).str.zfill(2) + table["county"].astype(str).str.zfill(3)

    frames = []
    for ind in catalog:
        if ind.source != "acs":
            continue
        value = _numeric(table[ind.source_field])
        if ind.moe_field:
            moe = _numeric(table[ind.moe_field])
            ci_low, ci_high = value - moe, value + moe
        else:
            ci_low = ci_high = pd.Series(np.nan, index=table.index)
        frames.append(
            pd.DataFrame(
                {
                    "fips": fips,
                    "indicator_id": ind.id,
                    "year": ind.year,
                    "value": value,
                    "ci_low": ci_low,
                    "ci_high": ci_high,
                    "source": "acs",
                }
            )
        )
    return pd.concat(frames, ignore_index=True)[LONG_COLUMNS]
