"""Pre-export data quality checks (spec §3). Any failure aborts the export."""

from __future__ import annotations

from collections import Counter

import pandas as pd

from pnw_health.config import EXPECTED_COUNTY_COUNTS, state_abbr
from pnw_health.indicators import Indicator

NON_NEGATIVE_UNITS = frozenset({"dollars", "count", "rate_per_100k"})


class DataValidationError(Exception):
    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("\n".join(problems))


def _example(rows: pd.DataFrame) -> str:
    first = rows.iloc[0]
    return f"{first.fips}={first.value}"


def _range_problems(name: str, present: pd.DataFrame, ind: Indicator) -> list[str]:
    """Check non-null rows against the valid range for the indicator's unit."""
    if ind.unit == "percent":
        bad, limit = present[(present.value < 0) | (present.value > 100)], "outside [0, 100]"
    elif ind.unit == "years":
        bad, limit = present[(present.value < 0) | (present.value > 120)], "outside [0, 120]"
    elif ind.unit in NON_NEGATIVE_UNITS:
        bad, limit = present[present.value < 0], "negative"
    else:
        return []
    return [] if bad.empty else [f"{name}: {len(bad)} value(s) {limit} (e.g. {_example(bad)})"]


def validate_display(
    values: pd.DataFrame,
    county_fips: set[str],
    catalog: list[Indicator],
    legacy: pd.DataFrame | None = None,
) -> None:
    """Check PNW display data, and any legacy rows; collect every problem, then raise once."""
    problems: list[str] = []

    outside = sorted(f for f in county_fips if state_abbr(f) is None)
    if outside:
        problems.append(f"boundaries include non-PNW counties: {', '.join(outside)}")
    counts = Counter(state_abbr(f) for f in county_fips)
    for state, expected in EXPECTED_COUNTY_COUNTS.items():
        if counts[state] != expected:
            problems.append(f"county count {state}: expected {expected}, got {counts[state]}")

    unknown = sorted(set(values.fips) - county_fips)
    if unknown:
        problems.append(f"values reference unknown counties: {', '.join(unknown)}")

    dupes = values[values.duplicated(["fips", "indicator_id"])]
    if not dupes.empty:
        keys = sorted({f"{r.fips}/{r.indicator_id}" for r in dupes.itertuples()})
        problems.append(f"duplicate (fips, indicator_id): {', '.join(keys)}")

    for ind in catalog:
        rows = values[values.indicator_id == ind.id]
        present = rows[rows.value.notna()]
        if present.empty:
            problems.append(f"{ind.id}: no non-null values")
            continue
        problems += _range_problems(ind.id, present, ind)
        if legacy is not None:
            old = legacy[(legacy.indicator_id == ind.id) & legacy.value.notna()]
            problems += _range_problems(f"{ind.id} legacy", old, ind)

    if problems:
        raise DataValidationError(problems)
