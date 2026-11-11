"""Project-wide constants and filesystem layout."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

STATES: dict[str, str] = {"53": "WA", "41": "OR", "16": "ID", "02": "AK"}
EXPECTED_COUNTY_COUNTS: dict[str, int] = {"WA": 39, "OR": 36, "ID": 44, "AK": 30}

ACS_YEAR = 2024
PLACES_RELEASE = 2025
PLACES_DATASET = "swc5-untb"
CHR_YEAR = 2025
CHR_LEGACY_YEAR = 2023
CHR_FILES: dict[int, str] = {2025: "analytic_data2025_v3.csv", 2023: "analytic_data2023_0.csv"}
GEO_YEAR = 2024
SCHEMA_VERSION = "1.0.0"


@dataclass(frozen=True)
class Paths:
    raw: Path
    interim: Path
    out: Path
    schema: Path

    @classmethod
    def default(cls, repo_root: Path) -> Paths:
        return cls(
            raw=repo_root / "data" / "raw",
            interim=repo_root / "data" / "interim",
            out=repo_root / "web" / "public" / "data",
            schema=repo_root / "schema",
        )


def state_abbr(fips: str) -> str | None:
    """Return the PNW state abbreviation for a 5-character county FIPS, else None."""
    return STATES.get(fips[:2])


def census_api_key(root: Path) -> str | None:
    """CENSUS_API_KEY from the environment, else from the git-ignored ``<root>/.env``."""
    if key := os.environ.get("CENSUS_API_KEY"):
        return key
    env_file = root / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text().splitlines():
        name, sep, value = line.strip().partition("=")
        if sep and name.strip() == "CENSUS_API_KEY":
            return value.strip().strip("\"'") or None
    return None
