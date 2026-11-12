"""Project-wide constants and filesystem layout."""

from __future__ import annotations

import os
import re
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
# Valdez-Cordova Census Area, split in 2019 into Chugach (02063) and Copper River (02066).
VALDEZ_CORDOVA_FIPS = "02261"
SCHEMA_VERSION = "1.3.0"


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


def _dotenv_value(raw: str) -> str:
    """A ``.env`` value: quoted up to its closing quote, else cut at an inline `` #`` comment."""
    quoted = raw.strip()
    if quoted[:1] in {'"', "'"}:
        end = quoted.find(quoted[0], 1)
        return quoted[1:end] if end != -1 else quoted[1:]
    comment = re.search(r"\s#", raw)
    return (raw[: comment.start()] if comment else raw).strip()


def census_api_key(root: Path) -> str | None:
    """CENSUS_API_KEY from the environment, else from the git-ignored ``<root>/.env``.

    The file may use shell syntax: an ``export`` prefix, quotes, and ``# comments``.
    """
    if key := os.environ.get("CENSUS_API_KEY"):
        return key
    env_file = root / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        line = re.sub(r"^export\s+", "", line)
        name, sep, value = line.partition("=")
        if sep and name.strip() == "CENSUS_API_KEY":
            return _dotenv_value(value) or None
    return None
