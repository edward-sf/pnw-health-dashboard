"""Project-wide constants and filesystem layout."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

STATES: dict[str, str] = {"53": "WA", "41": "OR", "16": "ID", "02": "AK"}
EXPECTED_COUNTY_COUNTS: dict[str, int] = {"WA": 39, "OR": 36, "ID": 44, "AK": 30}

ACS_YEAR = 2024
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
