import json
import os
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pytest

from pnw_health import export
from pnw_health.contract import (
    Manifest,
    ModelFile,
    ShapEntry,
    SourceVintage,
    TargetModel,
    ValuesFile,
)
from pnw_health.export import build_values_file, finalize_model, write_exports
from pnw_health.harmonize import LEGACY_COLUMNS
from pnw_health.ranks import add_ranks
from tests.helpers import (
    make_county_model,
    make_indicator,
    make_model_file,
    make_null_county_model,
)

CATALOG = [make_indicator("x", direction="higher_is_better")]
COUNTIES = {"53001", "53003", "02063"}


def ranked(rows: list[tuple[str, float, float | None, float | None]]) -> pd.DataFrame:
    df = pd.DataFrame(
        [
            {
                "fips": f,
                "indicator_id": "x",
                "value": v,
                "ci_low": lo,
                "ci_high": hi,
                "unreliable": False,
            }
            for f, v, lo, hi in rows
        ]
    )
    return add_ranks(df, CATALOG)


def no_legacy() -> pd.DataFrame:
    return pd.DataFrame(columns=LEGACY_COLUMNS)


def test_every_indicator_county_pair_present() -> None:
    vf = build_values_file(ranked([("53001", 10.0, 9.0, 11.0)]), no_legacy(), COUNTIES, CATALOG)
    entries = vf.root["x"]
    assert set(entries) == COUNTIES
    assert entries["53001"].v == 10.0
    assert (entries["53001"].lo, entries["53001"].hi) == (9.0, 11.0)
    assert entries["53001"].rank == 1
    assert entries["53003"].v is None
    assert entries["53003"].rank is None


def test_nan_becomes_none() -> None:
    vf = build_values_file(
        ranked([("53001", float("nan"), None, None)]), no_legacy(), COUNTIES, CATALOG
    )
    assert vf.root["x"]["53001"].v is None
    assert vf.root["x"]["53001"].lo is None


def test_legacy_attached_to_successor() -> None:
    legacy = pd.DataFrame(
        [
            {
                "fips": "02063",
                "indicator_id": "x",
                "legacy_fips": "02261",
                "legacy_name": "Valdez-Cordova Census Area (former)",
                "year": 2023,
                "value": 78.2,
                "ci_low": 77.0,
                "ci_high": 79.4,
            }
        ],
        columns=LEGACY_COLUMNS,
    )
    vf = build_values_file(ranked([("53001", 1.0, None, None)]), legacy, COUNTIES, CATALOG)
    entry = vf.root["x"]["02063"]
    assert entry.v is None
    assert entry.legacy is not None
    assert entry.legacy.fips == "02261"
    assert entry.legacy.v == 78.2
    assert vf.root["x"]["53001"].legacy is None


def test_legacy_key_omitted_when_absent() -> None:
    vf = build_values_file(ranked([("53001", 1.0, None, None)]), no_legacy(), COUNTIES, CATALOG)
    dumped = json.loads(vf.model_dump_json())
    assert "legacy" not in dumped["x"]["53001"]
    assert dumped["x"]["53003"] == {
        "v": None,
        "lo": None,
        "hi": None,
        "rank": None,
        "state_rank": None,
    }


def make_manifest() -> Manifest:
    return Manifest(
        schema_version="1.0.0",
        built_at=datetime(2026, 11, 10, tzinfo=UTC),
        sources=[SourceVintage(source="acs", year=2024, url="https://example.test")],
        indicators=CATALOG,
    )


TOPOLOGY = {"type": "Topology", "objects": {"counties": {"geometries": []}}, "arcs": []}


def test_write_exports_round_trip(tmp_path: Path) -> None:
    vf = build_values_file(
        ranked([("53001", float("nan"), None, None)]), no_legacy(), COUNTIES, CATALOG
    )
    manifest = make_manifest()
    model = make_model_file({"53001": make_county_model()})
    paths = write_exports(tmp_path / "out", manifest, vf, TOPOLOGY, model, staging=tmp_path / "s")
    assert sorted(p.name for p in paths) == [
        "counties.topojson",
        "manifest.json",
        "model.json",
        "values.json",
    ]
    for p in paths:
        text = p.read_text()
        assert "NaN" not in text
        assert "\n" not in text.strip()  # compact
        json.loads(text)
    assert ValuesFile.model_validate_json((tmp_path / "out" / "values.json").read_text()) == vf
    assert (
        Manifest.model_validate_json((tmp_path / "out" / "manifest.json").read_text()) == manifest
    )
    assert ModelFile.model_validate_json((tmp_path / "out" / "model.json").read_text()) == model


def test_legacy_exported_with_year() -> None:
    legacy = pd.DataFrame(
        [
            {
                "fips": "02063",
                "indicator_id": "x",
                "legacy_fips": "02261",
                "legacy_name": "Valdez-Cordova Census Area (former)",
                "year": 2023,
                "value": 78.2,
                "ci_low": 77.0,
                "ci_high": 79.4,
            }
        ],
        columns=LEGACY_COLUMNS,
    )
    vf = build_values_file(ranked([("53001", 1.0, None, None)]), legacy, COUNTIES, CATALOG)
    entry = vf.root["x"]["02063"]
    assert entry.v is None
    assert entry.rank is None
    assert entry.legacy is not None
    assert entry.legacy.year == 2023


def test_unreliable_exported_only_when_true() -> None:
    df = ranked([("53001", 1.0, None, None), ("53003", 2.0, None, None)])
    df.loc[df.fips == "53001", "unreliable"] = True
    dumped = json.loads(build_values_file(df, no_legacy(), COUNTIES, CATALOG).model_dump_json())
    assert dumped["x"]["53001"]["unreliable"] is True
    assert "unreliable" not in dumped["x"]["53003"]


def le(model: ModelFile) -> TargetModel:
    return model.targets["life_expectancy"]


def test_finalize_keeps_top_five_by_absolute_value() -> None:
    contributions = {"a": 0.1, "b": -5.0, "c": 4.0, "d": -3.0, "e": 2.0, "f": 1.0, "g": 0.2}
    shap = [ShapEntry(feature=k, value=1.0, contribution=v) for k, v in contributions.items()]
    final = finalize_model(make_model_file({"53001": make_county_model(shap=shap)}))
    assert [e.feature for e in le(final).counties["53001"].shap] == ["b", "c", "d", "e", "f"]


def test_finalize_ranks_before_rounding() -> None:
    contributions = {"a": 1.00001, "b": 1.00002, "c": 3.0, "d": 4.0, "e": 5.0, "f": 6.0}
    shap = [ShapEntry(feature=k, value=1.0, contribution=v) for k, v in contributions.items()]
    final = finalize_model(make_model_file({"53001": make_county_model(shap=shap)}))
    assert [e.feature for e in le(final).counties["53001"].shap] == ["f", "e", "d", "c", "b"]


def test_finalize_rounds_to_four_decimals() -> None:
    shap = [ShapEntry(feature="a", value=1.23456, contribution=-0.98765)]
    county = make_county_model(predicted=77.123456, shap=shap)
    final = finalize_model(make_model_file({"53001": county}))
    assert le(final).counties["53001"].predicted == 77.1235
    assert le(final).counties["53001"].shap[0].value == 1.2346
    assert le(final).counties["53001"].shap[0].contribution == -0.9877
    assert le(final).thresholds.sigma_model == 1.2346
    assert le(final).metrics.lightgbm.national.rmse == 1.2346
    assert le(final).metrics.lightgbm.national.n == 10
    assert le(final).model_card.lightgbm_params["deterministic"] is True


def test_finalize_leaves_input_full_precision() -> None:
    model = make_model_file({"53001": make_county_model(predicted=77.123456)})
    finalize_model(model)
    assert le(model).counties["53001"].predicted == 77.123456


def test_null_fields_serialize_as_json_null(tmp_path: Path) -> None:
    vf = build_values_file(ranked([("53001", 1.0, None, None)]), no_legacy(), COUNTIES, CATALOG)
    model = make_model_file({"02063": make_null_county_model()})
    out = tmp_path / "out"
    write_exports(out, make_manifest(), vf, TOPOLOGY, finalize_model(model), staging=tmp_path / "s")
    text = (out / "model.json").read_text()
    assert "NaN" not in text
    assert json.loads(text)["targets"]["life_expectancy"]["counties"]["02063"]["predicted"] is None


def _export_args() -> tuple[Manifest, ValuesFile, ModelFile]:
    vf = build_values_file(ranked([("53001", 1.0, None, None)]), no_legacy(), COUNTIES, CATALOG)
    return make_manifest(), vf, make_model_file({"53001": make_county_model()})


def test_write_exports_failure_keeps_previous_export(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "data"
    manifest, vf, model = _export_args()
    write_exports(out, manifest, vf, TOPOLOGY, model, staging=tmp_path / "s")
    before = {p.name: p.read_bytes() for p in out.iterdir()}

    real = export._write_json
    calls = 0

    def flaky(path: Path, data: object) -> Path:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("disk full")
        return real(path, data)

    monkeypatch.setattr(export, "_write_json", flaky)
    changed = manifest.model_copy(update={"schema_version": "9.9.9"})
    with pytest.raises(OSError, match="disk full"):
        write_exports(out, changed, vf, TOPOLOGY, model, staging=tmp_path / "s")
    assert {p.name: p.read_bytes() for p in out.iterdir()} == before
    assert list((tmp_path / "s").iterdir()) == []


def test_write_exports_leaves_only_the_four_files(tmp_path: Path) -> None:
    out = tmp_path / "data"
    write_exports(out, *_export_args()[:2], TOPOLOGY, _export_args()[2], staging=tmp_path / "s")
    assert sorted(p.name for p in out.iterdir()) == [
        "counties.topojson",
        "manifest.json",
        "model.json",
        "values.json",
    ]
    assert list((tmp_path / "s").iterdir()) == []


def _cross_device_replace(monkeypatch: pytest.MonkeyPatch) -> None:
    """os.replace fails with EXDEV when source and target are in different folders."""
    import errno

    real = os.replace

    def replace(src: str | Path, dst: str | Path) -> None:
        if Path(src).parent != Path(dst).parent:
            raise OSError(errno.EXDEV, "Invalid cross-device link")
        real(src, dst)

    monkeypatch.setattr(export.os, "replace", replace)


def test_write_exports_moves_across_filesystems(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    args = _export_args()
    expected = {
        p.name: p.read_bytes()
        for p in write_exports(
            tmp_path / "ref", args[0], args[1], TOPOLOGY, args[2], staging=tmp_path / "rs"
        )
    }
    _cross_device_replace(monkeypatch)
    out = tmp_path / "data"
    write_exports(out, args[0], args[1], TOPOLOGY, args[2], staging=tmp_path / "s")
    assert {p.name: p.read_bytes() for p in out.iterdir()} == expected
    assert list((tmp_path / "s").iterdir()) == []


def test_cross_device_copy_never_writes_the_final_name_directly(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The fallback copies beside the target, then renames, so no reader sees a partial file."""
    _cross_device_replace(monkeypatch)
    copied_to: list[Path] = []
    real_copy = export.shutil.copyfile

    def spy(src: Path, dst: Path) -> object:
        copied_to.append(Path(dst))
        return real_copy(src, dst)

    monkeypatch.setattr(export.shutil, "copyfile", spy)
    out = tmp_path / "data"
    write_exports(out, *_export_args()[:2], TOPOLOGY, _export_args()[2], staging=tmp_path / "s")
    finals = {out / n for n in ("manifest.json", "values.json", "counties.topojson", "model.json")}
    assert len(copied_to) == 4
    assert all(p.parent == out and p not in finals for p in copied_to)
    assert sorted(p.name for p in out.iterdir()) == sorted(p.name for p in finals)


def test_partial_move_names_replaced_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    real = os.replace

    def flaky(src: str | Path, dst: str | Path) -> None:
        if Path(dst).name == "counties.topojson":
            raise OSError("permission denied")
        real(src, dst)

    monkeypatch.setattr(export.os, "replace", flaky)
    out = tmp_path / "data"
    with pytest.raises(export.ExportError) as err:
        write_exports(out, *_export_args()[:2], TOPOLOGY, _export_args()[2], staging=tmp_path / "s")
    message = str(err.value)
    assert "manifest.json, values.json" in message
    assert "pnw-health run --stage export" in message
    assert "permission denied" in message
    assert list((tmp_path / "s").iterdir()) == []


def test_copy_failure_leaves_no_partial_and_keeps_untouched_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import errno

    out = tmp_path / "data"
    args = _export_args()
    write_exports(out, args[0], args[1], TOPOLOGY, args[2], staging=tmp_path / "s")
    before = {p.name: p.read_bytes() for p in out.iterdir()}

    _cross_device_replace(monkeypatch)
    real_copy = export.shutil.copyfile

    def full_on_values(src: Path, dst: Path) -> object:
        if Path(src).name == "values.json":
            Path(dst).write_text("half")
            raise OSError(errno.ENOSPC, "No space left on device")
        return real_copy(src, dst)

    monkeypatch.setattr(export.shutil, "copyfile", full_on_values)
    changed = args[0].model_copy(update={"schema_version": "9.9.9"})
    with pytest.raises(export.ExportError, match="already replaced: manifest.json"):
        write_exports(out, changed, args[1], TOPOLOGY, args[2], staging=tmp_path / "s")
    assert not list(out.glob(".*.partial"))
    for name in ("values.json", "counties.topojson", "model.json"):
        assert (out / name).read_bytes() == before[name]


def test_staging_inside_out_dir_rejected(tmp_path: Path) -> None:
    out = tmp_path / "data"
    with pytest.raises(ValueError, match="staging"):
        write_exports(out, *_export_args()[:2], TOPOLOGY, _export_args()[2], staging=out / "s")


def test_cleanup_failure_warns(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def broken(path: Path, **kwargs: object) -> None:
        raise OSError("busy")

    monkeypatch.setattr(export.shutil, "rmtree", broken)
    out = tmp_path / "data"
    write_exports(out, *_export_args()[:2], TOPOLOGY, _export_args()[2], staging=tmp_path / "s")
    err = capsys.readouterr().err
    assert "could not remove" in err
    assert "busy" in err


def test_failed_cleanup_of_partial_keeps_the_copy_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _cross_device_replace(monkeypatch)

    def full_disk(src: Path, dst: Path) -> None:
        Path(dst).write_text("half")
        raise OSError("disk full")

    real_unlink = Path.unlink

    def stuck(self: Path, missing_ok: bool = False) -> None:
        if self.name.endswith(".partial"):
            raise OSError("busy")
        real_unlink(self, missing_ok=missing_ok)

    monkeypatch.setattr(export.shutil, "copyfile", full_disk)
    monkeypatch.setattr(Path, "unlink", stuck)
    out = tmp_path / "data"
    with pytest.raises(export.ExportError, match="disk full"):
        write_exports(out, *_export_args()[:2], TOPOLOGY, _export_args()[2], staging=tmp_path / "s")


def test_first_move_failure_says_nothing_was_replaced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(src: str | Path, dst: str | Path) -> None:
        raise OSError("permission denied")

    monkeypatch.setattr(export.os, "replace", fail)
    with pytest.raises(export.ExportError) as err:
        write_exports(
            tmp_path / "data",
            *_export_args()[:2],
            TOPOLOGY,
            _export_args()[2],
            staging=tmp_path / "s",
        )
    message = str(err.value)
    assert "nothing was replaced" in message
    assert "mix" not in message
