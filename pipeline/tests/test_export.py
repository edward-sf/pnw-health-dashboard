import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from pnw_health.contract import Manifest, SourceVintage, ValuesFile
from pnw_health.export import build_values_file, write_exports
from pnw_health.harmonize import LEGACY_COLUMNS
from pnw_health.ranks import add_ranks
from tests.helpers import make_indicator

CATALOG = [make_indicator("x", direction="higher_is_better")]
COUNTIES = {"53001", "53003", "02063"}


def ranked(rows: list[tuple[str, float, float | None, float | None]]) -> pd.DataFrame:
    df = pd.DataFrame(
        [
            {"fips": f, "indicator_id": "x", "value": v, "ci_low": lo, "ci_high": hi}
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


def test_write_exports_round_trip(tmp_path: Path) -> None:
    vf = build_values_file(
        ranked([("53001", float("nan"), None, None)]), no_legacy(), COUNTIES, CATALOG
    )
    manifest = Manifest(
        schema_version="1.0.0",
        built_at=datetime(2026, 11, 10, tzinfo=UTC),
        sources=[SourceVintage(source="acs", year=2024, url="https://example.test")],
        indicators=CATALOG,
    )
    topo = {"type": "Topology", "objects": {"counties": {"geometries": []}}, "arcs": []}
    paths = write_exports(tmp_path / "out", manifest, vf, topo)
    assert sorted(p.name for p in paths) == ["counties.topojson", "manifest.json", "values.json"]
    for p in paths:
        text = p.read_text()
        assert "NaN" not in text
        assert "\n" not in text.strip()  # compact
        json.loads(text)
    assert ValuesFile.model_validate_json((tmp_path / "out" / "values.json").read_text()) == vf
    assert (
        Manifest.model_validate_json((tmp_path / "out" / "manifest.json").read_text()) == manifest
    )


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
