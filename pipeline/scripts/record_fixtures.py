"""Record small, real API responses as offline test fixtures.

This is the only code outside the CLI that touches the network. Re-run it when the
indicator catalog changes:

    uv run python scripts/record_fixtures.py variables
    uv run python scripts/record_fixtures.py acs   # needs CENSUS_API_KEY (env or repo .env)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import httpx

from pnw_health.config import ACS_YEAR, census_api_key
from pnw_health.indicators import load_catalog

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "pipeline" / "tests" / "fixtures"
PROFILE = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5/profile"


def record_variables() -> Path:
    """Save the catalog's ACS variable metadata (labels and MOE attributes)."""
    resp = httpx.get(f"{PROFILE}/variables.json", timeout=60)
    resp.raise_for_status()
    variables = resp.json()["variables"]
    wanted = sorted({i.source_field for i in load_catalog() if i.source == "acs"})
    subset = {code: variables[code] for code in wanted}
    out = FIXTURES / f"acs_profile_variables_{ACS_YEAR}.json"
    out.write_text(json.dumps(subset, indent=2, sort_keys=True) + "\n")
    return out


def record_acs_sample() -> Path:
    """Save catalog ACS fields for all PNW counties plus two non-PNW counties."""
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
    for q in queries:
        resp = httpx.get(PROFILE, params={"get": get, **q, "key": key}, timeout=60)
        resp.raise_for_status()
        header, *body = resp.json()
        rows += body
    rows.sort(key=lambda r: (r[-2], r[-1]))
    out = FIXTURES / f"acs_profile_{ACS_YEAR}_sample.json"
    out.write_text(json.dumps([header, *rows], indent=0) + "\n")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("what", choices=["variables", "acs"])
    args = parser.parse_args()
    print(record_variables() if args.what == "variables" else record_acs_sample())


if __name__ == "__main__":
    main()
