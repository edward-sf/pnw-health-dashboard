"""Assemble and write the web artifacts (spec §4)."""

from __future__ import annotations

import errno
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd

from pnw_health.contract import Legacy, Manifest, ModelFile, ValueEntry, ValuesFile
from pnw_health.indicators import Indicator
from pnw_health.model.config import TOP_N
from pnw_health.numeric import nan_to_none

MODEL_DECIMALS = 4


def _int(x: object) -> int | None:
    return None if x is None or pd.isna(x) else int(x)  # type: ignore[call-overload]


def _bool(x: object) -> bool:
    return False if x is None or pd.isna(x) else bool(x)  # type: ignore[call-overload]


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
                v=nan_to_none(r.value) if r is not None else None,
                lo=nan_to_none(r.ci_low) if r is not None else None,
                hi=nan_to_none(r.ci_high) if r is not None else None,
                rank=_int(r.rank) if r is not None else None,
                state_rank=_int(r.state_rank) if r is not None else None,
                legacy=Legacy(
                    fips=str(lg.legacy_fips),
                    name=str(lg.legacy_name),
                    year=int(lg.year),  # type: ignore[arg-type]
                    v=nan_to_none(lg.value),
                    lo=nan_to_none(lg.ci_low),
                    hi=nan_to_none(lg.ci_high),
                )
                if lg is not None
                else None,
                unreliable=_bool(r.unreliable) if r is not None else False,
            )
        out[ind.id] = entries
    return ValuesFile(out)


def _write_json(path: Path, data: Any) -> Path:
    # allow_nan=False makes any NaN that slipped through fail loudly instead of
    # producing invalid JSON for the browser.
    path.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False))
    return path


def _rounded(data: Any) -> Any:
    if isinstance(data, float):
        return round(data, MODEL_DECIMALS)
    if isinstance(data, dict):
        return {key: _rounded(value) for key, value in data.items()}
    if isinstance(data, list):
        return [_rounded(value) for value in data]
    return data


def finalize_model(model: ModelFile) -> ModelFile:
    """Keep each county's top factors, ranked at full precision, then round every float."""
    counties = {
        fips: county.model_copy(
            update={
                "shap": sorted(county.shap, key=lambda e: (-abs(e.contribution), e.feature))[:TOP_N]
            }
        )
        for fips, county in model.counties.items()
    }
    trimmed = model.model_copy(update={"counties": counties})
    return ModelFile.model_validate(_rounded(trimmed.model_dump()))


def write_model(path: Path, model: ModelFile) -> Path:
    return _write_json(path, model.model_dump(mode="json"))


def _move(src: Path, dst: Path) -> None:
    try:
        os.replace(src, dst)
    except OSError as err:
        if err.errno != errno.EXDEV:
            raise
        shutil.move(src, dst)


def write_exports(
    out_dir: Path,
    manifest: Manifest,
    values: ValuesFile,
    topology: dict[str, Any],
    model: ModelFile,
    *,
    staging: Path,
) -> list[Path]:
    """Write the four web files as a set: all of them change, or none do.

    Each file is written to a temporary directory under ``staging`` and moved into place
    only after all four writes succeed. ``staging`` must be outside the site's public
    folder (the CLI uses ``data/interim``): Vite copies everything in ``web/public``, so a
    run killed before cleanup must not leave files there. A rename across filesystems
    falls back to a move. The four moves are separate system calls, so a crash between two
    of them could still mix vintages; nothing that can fail on content runs between them.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    staging.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(dir=staging, prefix=".export-"))
    try:
        written = [
            _write_json(tmp / "manifest.json", manifest.model_dump(mode="json")),
            _write_json(tmp / "values.json", values.model_dump(mode="json")),
            _write_json(tmp / "counties.topojson", topology),
            write_model(tmp / "model.json", model),
        ]
        final = []
        for path in written:
            _move(path, out_dir / path.name)
            final.append(out_dir / path.name)
        return final
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
