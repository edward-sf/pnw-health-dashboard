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
from pathlib import Path

import httpx

from pnw_health.config import ACS_YEAR, CHR_YEAR, PLACES_RELEASE, census_api_key
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


def record_chr_sample(client: httpx.Client | None = None) -> Path:
    """Save the two CHR header rows and the catalog's columns for PNW and sample counties."""
    catalog = load_catalog()
    wanted = ["statecode", "countycode", "fipscode", "state", "county", "year"]
    for ind in catalog:
        if ind.source == "chr":
            stem = ind.source_field.removesuffix("_rawvalue")
            wanted += [ind.source_field, f"{stem}_cilow", f"{stem}_cihigh"]
    keep_states = {"53", "41", "16", "02"}
    keep_fips = {"06037", "36061", "53000", "00000"}
    c = client or make_client()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = fetch_chr(c, Path(tmp), catalog)
            with src.open(newline="", encoding="latin-1") as fh:
                reader = csv.reader(fh)
                labels = next(reader)
                names = next(reader)
                index = [names.index(w) if w in names else None for w in wanted]
                fips_at = names.index("fipscode")
                rows = [
                    [row[i] if i is not None else "" for i in index]
                    for row in reader
                    if row[fips_at][:2] in keep_states or row[fips_at] in keep_fips
                ]
            labels_out = [labels[i] if i is not None else "" for i in index]
    finally:
        if client is None:
            c.close()
    out = FIXTURES / f"chr_{CHR_YEAR}_sample.csv"
    with out.open("w", newline="", encoding="latin-1") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerows([labels_out, wanted, *rows])
    return out


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
    print(recorders[args.what]())


if __name__ == "__main__":
    main()
