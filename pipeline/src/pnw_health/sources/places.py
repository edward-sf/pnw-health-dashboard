"""CDC PLACES county estimates (Socrata), fetched nationally and parsed to the long format."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd

from pnw_health.config import PLACES_DATASET, PLACES_RELEASE
from pnw_health.fetch import FetchError, cached_get
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS

PLACES_URL = "https://data.cdc.gov/resource/{dataset}.json"
PLACES_LIMIT = 100000  # explicit $limit; a response this long may have been cut off
SELECT = "locationid,measureid,year,data_value,low_confidence_limit,high_confidence_limit"
VALUE_TYPE = "AgeAdjPrv"  # age-adjusted prevalence


def places_url() -> str:
    return PLACES_URL.format(dataset=PLACES_DATASET)


def _measures(catalog: list[Indicator]) -> list[str]:
    return [ind.source_field for ind in catalog if ind.source == "places"]


def places_cache_path(
    raw_dir: Path, catalog: list[Indicator], release: int = PLACES_RELEASE
) -> Path:
    """Cache file for this exact measure list, so a catalog change never reuses a stale file."""
    digest = hashlib.sha1(",".join(sorted(_measures(catalog))).encode()).hexdigest()[:8]
    return raw_dir / "places" / f"places_{release}_{digest}.json"


def fetch_places(
    client: httpx.Client,
    raw_dir: Path,
    catalog: list[Indicator],
    *,
    release: int = PLACES_RELEASE,
    refresh: bool = False,
) -> Path:
    """Fetch every catalog PLACES measure for all US counties in a single request."""
    measures = ",".join(f"'{m}'" for m in sorted(_measures(catalog)))
    params = {
        "$select": SELECT,
        "$where": f"datavaluetypeid='{VALUE_TYPE}' AND measureid in({measures})",
        "$order": "locationid,measureid",
        "$limit": str(PLACES_LIMIT),
    }
    return cached_get(
        client,
        places_url(),
        places_cache_path(raw_dir, catalog, release),
        params=params,
        refresh=refresh,
        validate=_load_rows,
    )


def _invalid(reason: str) -> FetchError:
    return FetchError(
        f"invalid PLACES data: {reason}; re-download with `pnw-health run --stage fetch --refresh`"
    )


def _load_rows(path: Path) -> list[dict[str, Any]]:
    """Read a Socrata response, raising FetchError unless it is complete rows with keys."""
    try:
        rows = json.loads(path.read_text())
    except ValueError as err:
        raise _invalid("response is not JSON") from err
    if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) for r in rows):
        raise _invalid("response is not a non-empty list of rows")
    if len(rows) >= PLACES_LIMIT:
        raise _invalid(f"response truncated at the {PLACES_LIMIT}-row limit")
    if any("locationid" not in r or "measureid" not in r for r in rows):
        raise _invalid("rows missing locationid or measureid")
    return rows


def _numeric(rows: pd.DataFrame, column: str) -> pd.Series:
    """Socrata omits null fields, so an absent key is NaN, as is any non-numeric text."""
    if column not in rows:
        return pd.Series(np.nan, index=rows.index, dtype="float64")
    return pd.to_numeric(rows[column], errors="coerce").astype("float64")


def parse_places(path: Path, catalog: list[Indicator]) -> pd.DataFrame:
    """One long-format row per county x PLACES indicator present in the file."""
    table = pd.DataFrame(_load_rows(path))
    frames = []
    for ind in catalog:
        if ind.source != "places":
            continue
        rows = table[table["measureid"] == ind.source_field]
        years = rows["year"].astype(str) if "year" in rows else pd.Series(dtype=str)
        bad = sorted(set(years[years != str(ind.year)]))
        if bad:
            raise _invalid(f"{ind.id} year {', '.join(bad)} does not match catalog year {ind.year}")
        frames.append(
            pd.DataFrame(
                {
                    "fips": rows["locationid"].astype(str),
                    "indicator_id": ind.id,
                    "year": ind.year,
                    "value": _numeric(rows, "data_value"),
                    "ci_low": _numeric(rows, "low_confidence_limit"),
                    "ci_high": _numeric(rows, "high_confidence_limit"),
                    "source": "places",
                }
            )
        )
    return pd.concat(frames, ignore_index=True)[LONG_COLUMNS]
