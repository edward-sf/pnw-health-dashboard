"""Census ACS 5-year Data Profile, fetched nationally and parsed to the long format."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from pnw_health.config import ACS_YEAR
from pnw_health.errors import InputError
from pnw_health.fetch import FetchError, cached_get
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


def acs_cache_path(raw_dir: Path, catalog: list[Indicator], year: int = ACS_YEAR) -> Path:
    """Cache file for this exact field list, so a catalog change never reuses a stale file."""
    digest = hashlib.sha1(",".join(sorted(_fields(catalog))).encode()).hexdigest()[:8]
    return raw_dir / "acs" / f"acs5_profile_{year}_{digest}.json"


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
        raise InputError(
            f"{len(fields)} ACS fields + NAME exceeds the Census limit of 50 variables per request"
        )
    params = {"get": ",".join(["NAME", *fields]), "for": "county:*"}
    if api_key:
        params["key"] = api_key
    dest = acs_cache_path(raw_dir, catalog, year)
    return cached_get(
        client,
        profile_url(year),
        dest,
        params=params,
        refresh=refresh,
        validate=lambda path: _load_table(path, fields),
    )


def _invalid(reason: str) -> FetchError:
    return FetchError(
        f"invalid ACS data: {reason}; re-download with `pnw-health run --stage fetch --refresh`"
    )


def _load_table(path: Path, fields: list[str]) -> list[list[str | None]]:
    """Read a Census response, raising FetchError unless it is a table with every field."""
    try:
        table = json.loads(path.read_text())
    except ValueError as err:
        raise _invalid("response is not JSON") from err
    if not isinstance(table, list) or len(table) < 2 or not isinstance(table[0], list):
        raise _invalid("response is not a table with data rows")
    missing = [f for f in ["state", "county", *fields] if f not in table[0]]
    if missing:
        raise _invalid(f"missing columns {', '.join(missing)}")
    return table


def _numeric(col: pd.Series) -> pd.Series:
    values = pd.to_numeric(col, errors="coerce").astype("float64")
    return values.mask(values.isin(CENSUS_SENTINELS), np.nan)


def parse_acs(path: Path, catalog: list[Indicator]) -> pd.DataFrame:
    """One long-format row per county x ACS indicator; sentinels and junk become NaN."""
    header, *rows = _load_table(path, _fields(catalog))
    table = pd.DataFrame(rows, columns=header, dtype="object")
    fips = table["state"].astype(str).str.zfill(2) + table["county"].astype(str).str.zfill(3)

    frames = []
    for ind in catalog:
        if ind.source != "acs":
            continue
        value = _numeric(table[ind.source_field])
        if ind.moe_field:
            moe = _numeric(table[ind.moe_field])
            # ACS values are non-negative; percents are also capped at 100. Rounding
            # drops float noise from the subtraction (2.6 - 1.2 -> 1.4, not 1.4000000000000001).
            ci_low = (value - moe).clip(lower=0).round(6)
            ci_high = (value + moe).round(6)
            if ind.unit == "percent":
                ci_high = ci_high.clip(upper=100)
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
                    "unreliable": False,
                }
            )
        )
    return pd.concat(frames, ignore_index=True)[LONG_COLUMNS]
