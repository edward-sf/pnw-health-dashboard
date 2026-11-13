"""Pre-export data quality checks (spec §3). Any failure aborts the export."""

from __future__ import annotations

from collections import Counter

import pandas as pd

from pnw_health.config import EXPECTED_COUNTY_COUNTS, RACE_GROUP_LABELS, STATES, state_abbr
from pnw_health.contract import CountyModel, ModelFile, Peers, StrataFile, TargetModel
from pnw_health.errors import PipelineError
from pnw_health.indicators import Indicator
from pnw_health.model.config import (
    ALLOWED_CATEGORIES,
    FEATURES,
    PEER_K,
    PEER_MIN_FEATURES,
    TARGETS,
)

NON_NEGATIVE_UNITS = frozenset({"dollars", "count", "rate_per_100k"})
ADDITIVITY_TOLERANCE = 1e-6
STALE_TOLERANCE = 1e-9
RERUN_MODEL = "re-run `pnw-health run --stage model`"

# Indicator id -> PNW states (abbreviations) it legitimately has no values for. Any other
# state with no values fails validation (M8 spec §3.5). Pipeline-only: not exported.
PARTIAL_STATES: dict[str, frozenset[str]] = {}


class DataValidationError(PipelineError):
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

    catalog_ids = {ind.id for ind in catalog}
    for unknown_id in sorted(set(PARTIAL_STATES) - catalog_ids):
        problems.append(f"PARTIAL_STATES lists {unknown_id} which is not in the catalog")
    for ind_id, exempt_states in sorted(PARTIAL_STATES.items()):
        for abbr in sorted(exempt_states - set(STATES.values())):
            problems.append(f"PARTIAL_STATES lists {abbr} for {ind_id}, which is not a PNW state")

    for ind in catalog:
        rows = values[values.indicator_id == ind.id]
        present = rows[rows.value.notna()]
        if present.empty:
            problems.append(f"{ind.id}: no non-null values")
            continue
        covered = set(present.fips.map(state_abbr))
        exempt = PARTIAL_STATES.get(ind.id, frozenset())
        for abbr in STATES.values():
            if abbr not in covered and abbr not in exempt:
                problems.append(f"{ind.id}: no values for {abbr}")
            elif abbr in covered and abbr in exempt:
                problems.append(
                    f"PARTIAL_STATES exempts {abbr} for {ind.id}, but it has values; "
                    "remove the exemption"
                )
        problems += _range_problems(ind.id, present, ind)
        if legacy is not None:
            old = legacy[(legacy.indicator_id == ind.id) & legacy.value.notna()]
            problems += _range_problems(f"{ind.id} legacy", old, ind)

    if problems:
        raise DataValidationError(problems)


def _adds_up(county: CountyModel) -> bool:
    if county.base_value is None or county.predicted is None:
        return False
    total = county.base_value + sum(entry.contribution for entry in county.shap)
    return abs(total - county.predicted) <= ADDITIVITY_TOLERANCE


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= STALE_TOLERANCE


def _stale_counties(
    target_id: str, model: TargetModel, values: pd.DataFrame, has_target: set[str]
) -> tuple[list[str], list[str]]:
    """Counties whose model actual or SHAP feature values differ from the current data."""
    present = values[values.value.notna()]
    lookup: dict[tuple[str, str], float] = {
        (fips, indicator_id): float(value)
        for fips, indicator_id, value in zip(
            present.fips, present.indicator_id, present.value.astype(float), strict=True
        )
    }
    stale_actual: list[str] = []
    stale_shap: list[str] = []
    for fips, county in sorted(model.counties.items()):
        if county.predicted is None or fips not in has_target:
            continue
        actual = lookup.get((fips, target_id))
        if county.actual is None or actual is None or not _close(county.actual, actual):
            stale_actual.append(fips)
        for entry in county.shap:
            data = lookup.get((fips, entry.feature))
            if (entry.value is None) != (data is None) or (
                entry.value is not None and data is not None and not _close(entry.value, data)
            ):
                stale_shap.append(fips)
                break
    return stale_actual, stale_shap


def _validate_target(
    target_id: str,
    model: TargetModel,
    values: pd.DataFrame,
    county_fips: set[str],
    catalog: list[Indicator],
) -> list[str]:
    """Problems with one target's model; the caller prefixes them with the target id."""
    problems: list[str] = []

    # The model-input digest covers only the data, so a catalog edit needs these checks.
    indicator = next((ind for ind in catalog if ind.id == target_id), None)
    if indicator is None:
        problems.append(f"target is not in the catalog; {RERUN_MODEL}")
    else:
        for field in ("direction", "label", "unit"):
            stale, current = getattr(model, field), getattr(indicator, field)
            if stale != current:
                problems.append(
                    f"model {field} {stale!r} does not match the catalog {current!r}; {RERUN_MODEL}"
                )
    if model.model_card.target != target_id:
        problems.append(
            f"model card target {model.model_card.target!r} does not match {target_id!r}; "
            f"{RERUN_MODEL}"
        )

    missing = sorted(county_fips - set(model.counties))
    if missing:
        problems.append(f"model is missing counties: {', '.join(missing)}")

    targets = values[(values.indicator_id == target_id) & values.value.notna()]
    has_target = set(targets.fips)
    insufficient = {f for f, c in model.counties.items() if c.flag == "insufficient_data"}
    unflagged = sorted(insufficient & has_target)
    if unflagged:
        problems.append(
            f"model flags counties insufficient_data despite a target: {', '.join(unflagged)}"
        )
    overflagged = sorted(set(model.counties) - insufficient - has_target)
    if overflagged:
        problems.append(
            f"model is not insufficient_data for counties with no target: {', '.join(overflagged)}"
        )

    broken = sorted(
        f for f, c in model.counties.items() if f not in insufficient and not _adds_up(c)
    )
    if broken:
        problems.append(f"model contributions do not sum to the prediction: {', '.join(broken)}")

    outside = sorted(set(model.counties) - county_fips)
    if outside:
        problems.append(f"model has counties outside the PNW: {', '.join(outside)}; {RERUN_MODEL}")

    stale_actual, stale_shap = _stale_counties(target_id, model, values, has_target)
    if stale_actual:
        problems.append(
            f"model actual does not match the current data for: {', '.join(stale_actual)}; "
            f"{RERUN_MODEL}"
        )
    if stale_shap:
        problems.append(
            f"model SHAP feature values do not match the current data for: "
            f"{', '.join(stale_shap)}; {RERUN_MODEL}"
        )

    categories = {ind.id: ind.category for ind in catalog}
    excluded = [f for f in model.model_card.features if categories.get(f) not in ALLOWED_CATEGORIES]
    if excluded:
        problems.append(f"model uses features outside allowed categories: {', '.join(excluded)}")

    return problems


def _peer_problems(peers: Peers, county_fips: set[str]) -> list[str]:
    """Problems with the peer method and lists; each list problem names the counties."""
    problems: list[str] = []
    method = peers.method
    if method.features != list(FEATURES):
        problems.append(
            f"peer method features {method.features} do not match FEATURES {list(FEATURES)}; "
            f"{RERUN_MODEL}"
        )
    if method.k != PEER_K:
        problems.append(f"peer method k {method.k} does not match PEER_K {PEER_K}; {RERUN_MODEL}")
    if method.min_features != PEER_MIN_FEATURES:
        problems.append(
            f"peer method min_features {method.min_features} does not match "
            f"PEER_MIN_FEATURES {PEER_MIN_FEATURES}; {RERUN_MODEL}"
        )
    k = method.k
    missing = sorted(county_fips - set(peers.counties))
    if missing:
        problems.append(f"peers are missing counties: {', '.join(missing)}")
    outside = sorted(set(peers.counties) - county_fips)
    if outside:
        problems.append(f"peers has counties outside the PNW: {', '.join(outside)}")
    outside_peer = sorted(
        {p for found in peers.counties.values() for p in found if p not in county_fips}
    )
    if outside_peer:
        problems.append(f"peer counties outside the PNW: {', '.join(outside_peer)}")
    self_listed = sorted(f for f, found in peers.counties.items() if f in found)
    if self_listed:
        problems.append(f"peers list the county itself: {', '.join(self_listed)}")
    duplicated = sorted(f for f, found in peers.counties.items() if len(found) != len(set(found)))
    if duplicated:
        problems.append(f"peer lists contain duplicates: {', '.join(duplicated)}")
    wrong = sorted(f for f, found in peers.counties.items() if len(found) not in (0, k))
    if wrong:
        problems.append(f"peer lists must have exactly {k} entries or none: {', '.join(wrong)}")
    # Ineligible counties (an empty list) are never anyone's peer.
    listed = {p for found in peers.counties.values() for p in found}
    empty_but_listed = sorted(f for f in listed if peers.counties.get(f) == [])
    if empty_but_listed:
        problems.append(
            "counties with no peers are listed as another county's peer: "
            f"{', '.join(empty_but_listed)}; {RERUN_MODEL}"
        )
    return problems


def validate_model(
    model: ModelFile,
    values: pd.DataFrame,
    county_fips: set[str],
    catalog: list[Indicator],
) -> None:
    """Check a full-precision model against PNW display data; collect every problem, then raise."""
    problems = []
    if list(model.targets) != list(TARGETS):
        problems.append(
            f"model targets {list(model.targets)} do not match TARGETS {list(TARGETS)}; "
            "rerun the model stage"
        )
    problems += [
        f"{target_id}: {problem}"
        for target_id, target in model.targets.items()
        for problem in _validate_target(target_id, target, values, county_fips, catalog)
    ]
    problems.extend(_peer_problems(model.peers, county_fips))
    if problems:
        raise DataValidationError(problems)


def _strata_range(ind: Indicator) -> tuple[float, float | None, str] | None:
    """Valid range for a strata value or CI bound (M10 spec §4.5).

    Unlike display values, years have no upper bound: a small group's life expectancy
    interval can pass 120 (CHR 2025 has PNW upper bounds near 161).
    """
    if ind.unit == "percent":
        return 0.0, 100.0, "outside [0, 100]"
    if ind.unit == "years" or ind.unit in NON_NEGATIVE_UNITS:
        return 0.0, None, "negative"
    return None


def _strata_entry_problems(strata: StrataFile, by_id: dict[str, Indicator]) -> list[str]:
    """Interval and unit-range problems, one per offending entry value."""
    problems: list[str] = []
    for ind_id, entry in strata.indicators.items():
        ind = by_id.get(ind_id)
        limits = _strata_range(ind) if ind is not None else None
        for fips, groups in sorted(entry.counties.items()):
            for group, s in groups.items():
                if s is None:
                    continue
                where = f"strata {ind_id} {fips} {group}"
                if (s.lo is not None and s.lo > s.v) or (s.hi is not None and s.v > s.hi):
                    problems.append(f"{where}: v {s.v} is outside its interval [{s.lo}, {s.hi}]")
                if limits is None:
                    continue
                low, high, limit = limits
                for x in (s.v, s.lo, s.hi):
                    if x is not None and (x < low or (high is not None and x > high)):
                        problems.append(f"{where}: {x} {limit}")
    return problems


def validate_strata(strata: StrataFile, county_fips: set[str], catalog: list[Indicator]) -> None:
    """Check ``strata.json`` against the catalog and display counties (M10 spec §4.5).

    No per-state coverage rule: partial coverage is the nature of this data. Collects
    every problem, then raises DataValidationError once.
    """
    problems: list[str] = []
    expected_groups = [(g, label) for g, label in RACE_GROUP_LABELS.items()]
    if [(g.id, g.label) for g in strata.groups] != expected_groups:
        problems.append("strata groups do not match RACE_GROUP_LABELS in display order")

    by_id = {ind.id: ind for ind in catalog if ind.race_groups}
    missing_ids = [i for i in by_id if i not in strata.indicators]
    if missing_ids:
        problems.append(
            f"strata is missing catalog indicator(s) with race_groups: {', '.join(missing_ids)}"
        )
    extra_ids = [i for i in strata.indicators if i not in by_id]
    if extra_ids:
        problems.append(
            f"strata has indicator(s) without catalog race_groups: {', '.join(extra_ids)}"
        )

    for ind_id, entry in strata.indicators.items():
        name = f"strata {ind_id}"
        ind = by_id.get(ind_id)
        if ind is not None and entry.groups != list(ind.race_groups or ()):
            problems.append(
                f"{name}: groups {list(entry.groups)} do not match the catalog's race_groups "
                f"{list(ind.race_groups or ())}"
            )
        missing = sorted(county_fips - set(entry.counties))
        if missing:
            problems.append(f"{name}: missing counties: {', '.join(missing)}")
        outside = sorted(set(entry.counties) - county_fips)
        if outside:
            problems.append(f"{name}: counties outside the display set: {', '.join(outside)}")
        mismatched = sorted(
            f for f, groups in entry.counties.items() if list(groups) != list(entry.groups)
        )
        if mismatched:
            problems.append(
                f"{name}: counties whose groups do not match its groups: {', '.join(mismatched)}"
            )
        if not any(s is not None for groups in entry.counties.values() for s in groups.values()):
            problems.append(f"{name}: no non-null values")

    problems += _strata_entry_problems(strata, by_id)
    if problems:
        raise DataValidationError(problems)
