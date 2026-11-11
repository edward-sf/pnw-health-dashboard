import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from pnw_health.contract import Manifest, ModelFile, ShapEntry, SourceVintage, ValuesFile
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
    paths = write_exports(tmp_path / "out", manifest, vf, TOPOLOGY, model)
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


def test_finalize_keeps_top_five_by_absolute_value() -> None:
    contributions = {"a": 0.1, "b": -5.0, "c": 4.0, "d": -3.0, "e": 2.0, "f": 1.0, "g": 0.2}
    shap = [ShapEntry(feature=k, value=1.0, contribution=v) for k, v in contributions.items()]
    final = finalize_model(make_model_file({"53001": make_county_model(shap=shap)}))
    assert [e.feature for e in final.counties["53001"].shap] == ["b", "c", "d", "e", "f"]


def test_finalize_ranks_before_rounding() -> None:
    contributions = {"a": 1.00001, "b": 1.00002, "c": 3.0, "d": 4.0, "e": 5.0, "f": 6.0}
    shap = [ShapEntry(feature=k, value=1.0, contribution=v) for k, v in contributions.items()]
    final = finalize_model(make_model_file({"53001": make_county_model(shap=shap)}))
    assert [e.feature for e in final.counties["53001"].shap] == ["f", "e", "d", "c", "b"]


def test_finalize_rounds_to_four_decimals() -> None:
    shap = [ShapEntry(feature="a", value=1.23456, contribution=-0.98765)]
    county = make_county_model(predicted=77.123456, shap=shap)
    final = finalize_model(make_model_file({"53001": county}))
    assert final.counties["53001"].predicted == 77.1235
    assert final.counties["53001"].shap[0].value == 1.2346
    assert final.counties["53001"].shap[0].contribution == -0.9877
    assert final.thresholds.sigma_model == 1.2346
    assert final.metrics.lightgbm.national.rmse == 1.2346
    assert final.metrics.lightgbm.national.n == 10
    assert final.model_card.lightgbm_params["deterministic"] is True


def test_finalize_leaves_input_full_precision() -> None:
    model = make_model_file({"53001": make_county_model(predicted=77.123456)})
    finalize_model(model)
    assert model.counties["53001"].predicted == 77.123456


def test_null_fields_serialize_as_json_null(tmp_path: Path) -> None:
    vf = build_values_file(ranked([("53001", 1.0, None, None)]), no_legacy(), COUNTIES, CATALOG)
    model = make_model_file({"02063": make_null_county_model()})
    write_exports(tmp_path, make_manifest(), vf, TOPOLOGY, finalize_model(model))
    text = (tmp_path / "model.json").read_text()
    assert "NaN" not in text
    assert json.loads(text)["counties"]["02063"]["predicted"] is None
