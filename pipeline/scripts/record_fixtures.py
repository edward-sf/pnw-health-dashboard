"""Record small, real API responses as offline test fixtures.

This is the only code outside the CLI that touches the network. Re-run it when the
indicator catalog changes:

    uv run python scripts/record_fixtures.py variables
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import httpx

from pnw_health.config import ACS_YEAR
from pnw_health.indicators import load_catalog

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("what", choices=["variables"])
    args = parser.parse_args()
    if args.what == "variables":
        print(record_variables())


if __name__ == "__main__":
    main()
