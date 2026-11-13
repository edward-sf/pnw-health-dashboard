"""Record small, real API responses as offline test fixtures.

This is the only code outside the CLI that touches the network. Re-run it when the
indicator catalog changes:

    uv run python scripts/record_fixtures.py variables
    uv run python scripts/record_fixtures.py acs   # needs CENSUS_API_KEY (env or repo .env)
    uv run python scripts/record_fixtures.py places   # public API, no key
    uv run python scripts/record_fixtures.py chr   # ~13 MB public CSV, no key
"""

from __future__ import annotations

import argparse
import csv
import json
import tempfile
from collections.abc import Callable
from pathlib import Path

import httpx

from pnw_health.config import (
    ACS_YEAR,
    CHR_LEGACY_YEAR,
    CHR_YEAR,
    PLACES_RELEASE,
    VALDEZ_CORDOVA_FIPS,
    census_api_key,
)
from pnw_health.fetch import fetch_json, make_client
from pnw_health.indicators import load_catalog
from pnw_health.sources.chr import fetch_chr
from pnw_health.sources.places import fetch_places

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "pipeline" / "tests" / "fixtures"
PROFILE = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5/profile"


def record_variables() -> Path:
    """Save the catalog's ACS variable metadata (labels and MOE attributes)."""
    with make_client() as client:
        variables = fetch_json(client, f"{PROFILE}/variables.json")["variables"]
    wanted = sorted({i.source_field for i in load_catalog() if i.source == "acs"})
    subset = {code: variables[code] for code in wanted}
    out = FIXTURES / f"acs_profile_variables_{ACS_YEAR}.json"
    out.write_text(json.dumps(subset, indent=2, sort_keys=True) + "\n")
    return out


def record_acs_sample(client: httpx.Client | None = None) -> Path:
    """Save catalog ACS fields for all PNW counties plus two non-PNW counties.

    Uses the pipeline's fetch helpers so error messages never contain the API key.
    """
    key = census_api_key(REPO_ROOT)
    if not key:
        raise SystemExit("CENSUS_API_KEY not set (environment or repo-root .env)")
    fields = []
    for ind in load_catalog():
        if ind.source == "acs":
            fields += [ind.source_field, *([ind.moe_field] if ind.moe_field else [])]
    get = ",".join(["NAME", *fields])
    queries = [
        {"for": "county:*", "in": "state:53,41,16,02"},
        {"for": "county:037", "in": "state:06"},
        {"for": "county:061", "in": "state:36"},
    ]
    header: list[str] = []
    rows: list[list[str]] = []
    c = client or make_client()
    try:
        for q in queries:
            header, *body = fetch_json(c, PROFILE, params={"get": get, **q, "key": key})
            rows += body
    finally:
        if client is None:
            c.close()
    rows.sort(key=lambda r: (r[-2], r[-1]))
    out = FIXTURES / f"acs_profile_{ACS_YEAR}_sample.json"
    out.write_text(json.dumps([header, *rows], indent=0) + "\n")
    return out


def record_places_sample(client: httpx.Client | None = None) -> Path:
    """Save catalog PLACES rows for all PNW counties plus two non-PNW counties."""
    catalog = load_catalog()
    c = client or make_client()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            raw = json.loads(fetch_places(c, Path(tmp), catalog).read_text())
    finally:
        if client is None:
            c.close()
    keep = {"53", "41", "16", "02"}
    rows = [r for r in raw if r["locationid"][:2] in keep or r["locationid"] in {"06037", "36061"}]
    out = FIXTURES / f"places_{PLACES_RELEASE}_sample.json"
    out.write_text(json.dumps(rows, indent=0) + "\n")
    return out


def _record_chr_file(
    c: httpx.Client,
    year: int,
    wanted: list[str],
    keep: Callable[[str], bool],
    optional: list[str] | None = None,
) -> Path:
    """Copy ``wanted`` columns (blank if absent) and the ``optional`` ones the file has."""
    catalog = load_catalog()
    with tempfile.TemporaryDirectory() as tmp:
        src = fetch_chr(c, Path(tmp), catalog, year)
        with src.open(newline="", encoding="latin-1") as fh:
            reader = csv.reader(fh)
            labels = next(reader)
            names = next(reader)
            wanted = [*wanted, *(o for o in optional or [] if o in names)]
            index = [names.index(w) if w in names else None for w in wanted]
            fips_at = names.index("fipscode")
            rows = [
                [row[i] if i is not None else "" for i in index]
                for row in reader
                if len(row) > fips_at and keep(row[fips_at])
            ]
        labels_out = [labels[i] if i is not None else "" for i in index]
    out = FIXTURES / f"chr_{year}_sample.csv"
    with out.open("w", newline="", encoding="latin-1") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerows([labels_out, wanted, *rows])
    return out


def record_chr_sample(client: httpx.Client | None = None) -> list[Path]:
    """Save the CHR header rows and the catalog's columns for the current and legacy files.

    The current file keeps PNW and sample counties, plus the race-group columns it has
    for each indicator with ``race_groups``; the 2023 file keeps only the retired
    Valdez-Cordova row (02261), the Alaska state row and one Washington county.
    """
    wanted = ["statecode", "countycode", "fipscode", "state", "county", "year"]
    race: list[str] = []
    for ind in load_catalog():
        if ind.source == "chr":
            stem = ind.source_field.removesuffix("_rawvalue")
            wanted += [ind.source_field, f"{stem}_cilow", f"{stem}_cihigh", f"{stem}_flag"]
            for g in ind.race_groups or ():
                col = f"{stem}_race_{g}"
                race += [col, f"{col}_cilow", f"{col}_cihigh", f"{col}_flag"]
    keep_states = {"53", "41", "16", "02"}
    keep_fips = {"06037", "36061", "53000", "00000"}
    c = client or make_client()
    try:
        current = _record_chr_file(
            c, CHR_YEAR, wanted, lambda f: f[:2] in keep_states or f in keep_fips, race
        )
        legacy = _record_chr_file(
            c, CHR_LEGACY_YEAR, wanted, lambda f: f in {VALDEZ_CORDOVA_FIPS, "02000", "53033"}
        )
    finally:
        if client is None:
            c.close()
    return [current, legacy]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("what", choices=["variables", "acs", "places", "chr"])
    args = parser.parse_args()
    recorders = {
        "variables": record_variables,
        "acs": record_acs_sample,
        "places": record_places_sample,
        "chr": record_chr_sample,
    }
    result = recorders[args.what]()
    for path in result if isinstance(result, list) else [result]:
        print(path)


if __name__ == "__main__":
    main()
