"""Build ``strata.json``: CHR outcomes by race and ethnicity (M10 spec §4.3).

Strata bypass harmonize: they never enter the long frame, ranks or the model, and only
the current CHR file is used, so a successor county with no row gets all-null groups.
"""

from __future__ import annotations

import pandas as pd

from pnw_health.config import CHR_YEAR, RACE_GROUP_LABELS, state_abbr
from pnw_health.contract import StrataFile, StrataGroup, StrataIndicator, StratumEntry
from pnw_health.indicators import Indicator, RaceGroup
from pnw_health.numeric import nan_to_none
from pnw_health.validate import DataValidationError


def build_strata_file(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> StrataFile:
    """Every display FIPS x every listed group, ``None`` where no row exists.

    Rows outside the PNW are ignored. A PNW FIPS that is not a display county (for
    example a retired Alaska code) raises DataValidationError, so a renamed county can
    never silently show every group as missing.
    """
    unknown = sorted({f for f in rows.fips if state_abbr(f) is not None} - county_fips)
    if unknown:
        raise DataValidationError(
            [f"strata reference PNW counties that are not display counties: {', '.join(unknown)}"]
        )
    keys = ["indicator_id", "fips", "group"]
    dupes = rows[rows.duplicated(keys, keep=False)]
    if not dupes.empty:
        names = sorted({f"{r.indicator_id}/{r.fips}/{r.group}" for r in dupes.itertuples()})
        raise DataValidationError(
            [f"duplicate strata rows (indicator_id/fips/group): {', '.join(names)}"]
        )
    found = {(r.indicator_id, r.fips, r.group): r for r in rows.itertuples(index=False)}
    indicators: dict[str, StrataIndicator] = {}
    for ind in catalog:
        if not ind.race_groups:
            continue
        counties: dict[str, dict[RaceGroup, StratumEntry | None]] = {}
        for fips in sorted(county_fips):
            groups: dict[RaceGroup, StratumEntry | None] = {}
            for group in ind.race_groups:
                r = found.get((ind.id, fips, group))
                groups[group] = (
                    StratumEntry(
                        v=float(r.value),  # type: ignore[arg-type]
                        lo=nan_to_none(r.ci_low),
                        hi=nan_to_none(r.ci_high),
                        unreliable=bool(r.unreliable),
                    )
                    if r is not None
                    else None
                )
            counties[fips] = groups
        indicators[ind.id] = StrataIndicator(groups=list(ind.race_groups), counties=counties)
    return StrataFile(
        dimension="race",
        source="chr",
        year=CHR_YEAR,
        groups=[StrataGroup(id=g, label=label) for g, label in RACE_GROUP_LABELS.items()],
        indicators=indicators,
    )
