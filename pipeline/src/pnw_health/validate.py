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


def validate_display(values: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]) -> None:
    """Check PNW display data; collect every problem, then raise once."""
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
        if ind.unit == "percent":
            bad = present[(present.value < 0) | (present.value > 100)]
            if not bad.empty:
                problems.append(
                    f"{ind.id}: {len(bad)} value(s) outside [0, 100] (e.g. {_example(bad)})"
                )
        elif ind.unit == "years":
            bad = present[(present.value < 0) | (present.value > 120)]
            if not bad.empty:
                problems.append(
                    f"{ind.id}: {len(bad)} value(s) outside [0, 120] (e.g. {_example(bad)})"
                )
        elif ind.unit in NON_NEGATIVE_UNITS:
            bad = present[present.value < 0]
            if not bad.empty:
                problems.append(f"{ind.id}: {len(bad)} value(s) negative (e.g. {_example(bad)})")

    if problems:
        raise DataValidationError(problems)
