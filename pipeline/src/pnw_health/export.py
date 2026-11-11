"""Assemble and write the web artifacts (spec §4)."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pandas as pd

from pnw_health.contract import Legacy, Manifest, ValueEntry, ValuesFile
from pnw_health.indicators import Indicator


def _num(x: object) -> float | None:
    if x is None or x is pd.NA:
        return None
    f = float(x)  # type: ignore[arg-type]
    return None if math.isnan(f) else f


def _int(x: object) -> int | None:
    return None if x is None or pd.isna(x) else int(x)  # type: ignore[call-overload]


def build_values_file(
    values: pd.DataFrame,
    legacy: pd.DataFrame,
    county_fips: set[str],
    catalog: list[Indicator],
) -> ValuesFile:
    """Every catalog indicator x every county gets an entry; missing rows are all-null."""
    rows = {(r.indicator_id, r.fips): r for r in values.itertuples(index=False)}
    legacies = {(r.indicator_id, r.fips): r for r in legacy.itertuples(index=False)}
    out: dict[str, dict[str, ValueEntry]] = {}
    for ind in catalog:
        entries: dict[str, ValueEntry] = {}
        for fips in sorted(county_fips):
            r = rows.get((ind.id, fips))
            lg = legacies.get((ind.id, fips))
            entries[fips] = ValueEntry(
                v=_num(r.value) if r is not None else None,
                lo=_num(r.ci_low) if r is not None else None,
                hi=_num(r.ci_high) if r is not None else None,
                rank=_int(r.rank) if r is not None else None,
                state_rank=_int(r.state_rank) if r is not None else None,
                legacy=Legacy(
                    fips=str(lg.legacy_fips),
                    name=str(lg.legacy_name),
                    year=int(lg.year),  # type: ignore[arg-type]
                    v=_num(lg.value),
                    lo=_num(lg.ci_low),
                    hi=_num(lg.ci_high),
                )
                if lg is not None
                else None,
            )
        out[ind.id] = entries
    return ValuesFile(out)


def _write_json(path: Path, data: Any) -> Path:
    # allow_nan=False makes any NaN that slipped through fail loudly instead of
    # producing invalid JSON for the browser.
    path.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False))
    return path


def write_exports(
    out_dir: Path, manifest: Manifest, values: ValuesFile, topology: dict[str, Any]
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    return [
        _write_json(out_dir / "manifest.json", manifest.model_dump(mode="json")),
        _write_json(out_dir / "values.json", values.model_dump(mode="json")),
        _write_json(out_dir / "counties.topojson", topology),
    ]
