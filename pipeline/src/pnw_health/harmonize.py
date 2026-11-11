"""Combine source frames and reconcile county geography to the 2020 vintage."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from pnw_health.config import state_abbr
from pnw_health.long import LONG_COLUMNS

FIPS_RENAMES: dict[str, str] = {"02270": "02158"}  # Wade Hampton -> Kusilvak
FIPS_SPLITS: dict[str, tuple[str, ...]] = {"02261": ("02063", "02066")}  # Valdez-Cordova
LEGACY_NAMES: dict[str, str] = {"02261": "Valdez-Cordova Census Area (former)"}
LEGACY_COLUMNS: list[str] = [
    "fips",
    "indicator_id",
    "legacy_fips",
    "legacy_name",
    "year",
    "value",
    "ci_low",
    "ci_high",
]


@dataclass
class HarmonizeResult:
    values: pd.DataFrame
    legacy: pd.DataFrame
    warnings: list[str] = field(default_factory=list)


def harmonize(frames: list[pd.DataFrame]) -> HarmonizeResult:
    """Apply FIPS renames and split handling (spec §3) to concatenated source frames."""
    values = pd.concat([f[LONG_COLUMNS] for f in frames], ignore_index=True)
    values["fips"] = values["fips"].replace(FIPS_RENAMES)

    dupes = values[values.duplicated(["fips", "indicator_id"], keep=False)]
    if not dupes.empty:
        keys = sorted({f"{r.fips}/{r.indicator_id}" for r in dupes.itertuples()})
        raise ValueError(f"duplicate (fips, indicator_id) after renames: {', '.join(keys)}")

    legacy_rows: list[dict[str, object]] = []
    warnings: list[str] = []
    for old, successors in FIPS_SPLITS.items():
        for row in values[values.fips == old].itertuples():
            has_successor = (
                values.fips.isin(successors)
                & (values.indicator_id == row.indicator_id)
                & values.value.notna()
            ).any()
            if has_successor:
                continue
            for new in successors:
                legacy_rows.append(
                    {
                        "fips": new,
                        "indicator_id": row.indicator_id,
                        "legacy_fips": old,
                        "legacy_name": LEGACY_NAMES[old],
                        "year": row.year,
                        "value": row.value,
                        "ci_low": row.ci_low,
                        "ci_high": row.ci_high,
                    }
                )
            warnings.append(
                f"{row.indicator_id}: reported only for {old}; successors "
                f"{', '.join(successors)} set to null with legacy reference"
            )
        values = values[values.fips != old]

    return HarmonizeResult(
        values=values.reset_index(drop=True),
        legacy=pd.DataFrame(legacy_rows, columns=LEGACY_COLUMNS),
        warnings=warnings,
    )


def pnw_only(df: pd.DataFrame) -> pd.DataFrame:
    """Keep rows whose FIPS is in one of the four PNW states."""
    return df[df["fips"].map(state_abbr).notna()].reset_index(drop=True)
