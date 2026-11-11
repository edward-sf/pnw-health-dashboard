"""County Health Rankings national analytic CSV, fetched once and parsed to the long format."""

from __future__ import annotations

from pathlib import Path

import httpx
import numpy as np
import pandas as pd
import pandas.errors

from pnw_health.config import CHR_FILES, CHR_LEGACY_YEAR, CHR_YEAR
from pnw_health.fetch import FetchError, cached_get
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS

CHR_BASE_URL = "https://www.countyhealthrankings.org/sites/default/files/media/document/"
ID_COLUMNS = ("countycode", "fipscode")
ENCODING = "latin-1"


def chr_url(year: int) -> str:
    return f"{CHR_BASE_URL}{CHR_FILES[year]}"


def chr_cache_path(raw_dir: Path, year: int) -> Path:
    return raw_dir / "chr" / CHR_FILES[year]


def _invalid(reason: str) -> FetchError:
    return FetchError(
        f"invalid CHR data: {reason}; re-download with `pnw-health run --stage fetch --refresh`"
    )


def _fields(catalog: list[Indicator], year: int | None = None) -> list[Indicator]:
    return [i for i in catalog if i.source == "chr" and (year is None or i.year == year)]


def _ci_columns(field: str) -> tuple[str, str]:
    stem = field.removesuffix("_rawvalue")
    return f"{stem}_cilow", f"{stem}_cihigh"


def _check_columns(path: Path, needed: list[str]) -> None:
    """Raise FetchError unless the file is a CSV whose variable-name row has every column."""
    try:
        header = pd.read_csv(path, header=1, nrows=0, dtype=str, encoding=ENCODING)
    except (pandas.errors.ParserError, pandas.errors.EmptyDataError, UnicodeError) as err:
        raise _invalid("response is not a CSV") from err
    missing = sorted(set(needed) - set(header.columns))
    if missing:
        raise _invalid(f"missing column(s) {', '.join(missing)}")


def fetch_chr(
    client: httpx.Client,
    raw_dir: Path,
    catalog: list[Indicator],
    year: int = CHR_YEAR,
    *,
    refresh: bool = False,
) -> Path:
    """Download the CHR analytic file for ``year``, checking it holds the catalog's columns.

    Only the current ``CHR_YEAR`` file is checked against the catalog; other vintages are
    fetched for specific legacy indicators, so only the id columns are required.
    """
    needed = list(ID_COLUMNS)
    if year == CHR_YEAR:
        needed += [i.source_field for i in _fields(catalog)]

    return cached_get(
        client,
        chr_url(year),
        chr_cache_path(raw_dir, year),
        refresh=refresh,
        validate=lambda path: _check_columns(path, needed),
    )


def _numeric(table: pd.DataFrame, column: str) -> pd.Series:
    """Blank or absent cells are NaN; a true 0 stays 0.0."""
    if column not in table:
        return pd.Series(np.nan, index=table.index, dtype="float64")
    return pd.to_numeric(table[column], errors="coerce").astype("float64")


def _unreliable(table: pd.DataFrame, field: str) -> pd.Series:
    """CHR's flag column is 0 = no flag, 1 = unreliable, 2 = suppressed; most fields have none."""
    column = f"{field.removesuffix('_rawvalue')}_flag"
    if column not in table:
        return pd.Series(False, index=table.index, dtype="bool")
    return table[column].eq("1")


def _long_frame(counties: pd.DataFrame, ind: Indicator, year: int) -> pd.DataFrame:
    low, high = _ci_columns(ind.source_field)
    return pd.DataFrame(
        {
            "fips": counties["fipscode"].astype(str),
            "indicator_id": ind.id,
            "year": year,
            **{
                name: (_numeric(counties, column) * ind.source_scale).round(6)
                for name, column in (
                    ("value", ind.source_field),
                    ("ci_low", low),
                    ("ci_high", high),
                )
            },
            "source": "chr",
            "unreliable": _unreliable(counties, ind.source_field),
        }
    )


def parse_chr(path: Path, catalog: list[Indicator]) -> pd.DataFrame:
    """One long-format row per county x CHR indicator; state and national rows are dropped."""
    table = pd.read_csv(path, header=1, dtype=str, encoding=ENCODING, low_memory=False)
    missing = sorted(set(ID_COLUMNS) - set(table.columns))
    if missing:
        raise _invalid(f"missing column(s) {', '.join(missing)}")
    counties = table[table["countycode"] != "000"]
    frames = []
    for ind in _fields(catalog):
        if ind.source_field not in counties:
            raise _invalid(f"missing column {ind.source_field}")
        frames.append(_long_frame(counties, ind, ind.year))
    return pd.concat(frames, ignore_index=True)[LONG_COLUMNS]


def parse_chr_legacy(path: Path, catalog: list[Indicator]) -> pd.DataFrame:
    """Non-null values for the retired Valdez-Cordova FIPS ``02261`` from the 2023 file.

    Catalog fields missing from the older file are skipped, not errors.
    """
    table = pd.read_csv(path, header=1, dtype=str, encoding=ENCODING, low_memory=False)
    missing = sorted(set(ID_COLUMNS) - set(table.columns))
    if missing:
        raise _invalid(f"missing column(s) {', '.join(missing)}")
    retired = table[table["fipscode"] == "02261"]
    frames = [
        _long_frame(retired, ind, CHR_LEGACY_YEAR)
        for ind in _fields(catalog)
        if ind.source_field in retired
    ]
    if not frames:
        return pd.DataFrame(columns=LONG_COLUMNS)
    out = pd.concat(frames, ignore_index=True)
    return out[out["value"].notna()].reset_index(drop=True)[LONG_COLUMNS]
