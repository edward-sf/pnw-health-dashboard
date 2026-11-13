"""Assemble and write the web artifacts (spec §4)."""

from __future__ import annotations

import errno
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd

from pnw_health.contract import Legacy, Manifest, ModelFile, StrataFile, ValueEntry, ValuesFile
from pnw_health.errors import PipelineError
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
    targets = {
        target_id: target.model_copy(
            update={
                "counties": {
                    fips: county.model_copy(
                        update={
                            "shap": sorted(
                                county.shap, key=lambda e: (-abs(e.contribution), e.feature)
                            )[:TOP_N]
                        }
                    )
                    for fips, county in target.counties.items()
                }
            }
        )
        for target_id, target in model.targets.items()
    }
    trimmed = model.model_copy(update={"targets": targets})
    return ModelFile.model_validate(_rounded(trimmed.model_dump()))


def finalize_strata(strata: StrataFile) -> StrataFile:
    """Round every float the same way as the model (``_rounded``)."""
    return StrataFile.model_validate(_rounded(strata.model_dump()))


def write_model(path: Path, model: ModelFile) -> Path:
    return _write_json(path, model.model_dump(mode="json"))


class ExportError(PipelineError):
    """Moving the staged export into place failed partway."""


def _move(src: Path, dst: Path) -> None:
    """Rename ``src`` to ``dst``; across filesystems, copy beside ``dst`` and then rename.

    Either way ``dst`` only ever appears complete: a crash mid-copy leaves a hidden
    ``.<name>.partial`` file next to it, never a truncated ``dst``.
    """
    try:
        os.replace(src, dst)
    except OSError as err:
        if err.errno != errno.EXDEV:
            raise
        partial = dst.with_name(f".{dst.name}.partial")
        try:
            shutil.copyfile(src, partial)
            os.replace(partial, dst)
        finally:
            # Never let a failed cleanup hide the copy error, or a move that succeeded.
            try:
                partial.unlink(missing_ok=True)
            except OSError as cleanup_err:
                print(f"warning: could not remove {partial}: {cleanup_err}", file=sys.stderr)


def _remove(tmp: Path) -> None:
    try:
        shutil.rmtree(tmp)
    except OSError as err:
        print(f"warning: could not remove staging directory {tmp}: {err}", file=sys.stderr)


def write_exports(
    out_dir: Path,
    manifest: Manifest,
    values: ValuesFile,
    topology: dict[str, Any],
    model: ModelFile,
    strata: StrataFile,
    *,
    staging: Path,
) -> list[Path]:
    """Write the five web files, replacing the previous export only once all five are written.

    Each file is written to a temporary directory under ``staging``. ``staging`` must be
    outside the site's public folder (the CLI uses ``data/interim``): Vite copies
    everything in ``web/public``, so a run killed before cleanup must not leave files
    there. A failed write leaves the previous export untouched.

    The files are then moved into place one at a time. On one filesystem each move is a
    rename; across filesystems it is a copy beside the target and then a rename, so no
    file is ever seen half-written. The moves are still five steps, so a crash, or an
    error such as a full disk on the copy path, between two of them leaves a mix of old
    and new files. An error raises ExportError naming the files already replaced.
    """
    if staging.resolve().is_relative_to(out_dir.resolve()):
        raise ValueError(f"staging {staging} must not be inside the output folder {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    staging.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(dir=staging, prefix=".export-"))
    try:
        written = [
            _write_json(tmp / "manifest.json", manifest.model_dump(mode="json")),
            _write_json(tmp / "values.json", values.model_dump(mode="json")),
            _write_json(tmp / "counties.topojson", topology),
            write_model(tmp / "model.json", model),
            _write_json(tmp / "strata.json", strata.model_dump(mode="json")),
        ]
        final: list[Path] = []
        for path in written:
            target = out_dir / path.name
            try:
                _move(path, target)
            except OSError as err:
                if final:
                    done = ", ".join(p.name for p in final)
                    state = f"already replaced: {done}. The folder may mix two exports"
                else:
                    state = "nothing was replaced"
                raise ExportError(
                    f"export stopped moving {path.name} into {out_dir} ({err}); {state}: "
                    "re-run `pnw-health run --stage export`"
                ) from err
            final.append(target)
        return final
    finally:
        _remove(tmp)
