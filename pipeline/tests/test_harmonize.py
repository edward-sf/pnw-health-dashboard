import math
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import pytest

from pnw_health.errors import InputError
from pnw_health.harmonize import LEGACY_COLUMNS, LEGACY_DTYPES, harmonize, pnw_only
from pnw_health.long import LONG_COLUMNS


def long_rows(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "fips": f,
                "indicator_id": i,
                "year": 2024,
                "value": v,
                "ci_low": v - 1,
                "ci_high": v + 1,
                "source": "chr",
            }
            for f, i, v in rows
        ],
        columns=LONG_COLUMNS,
    )


def test_rename_wade_hampton() -> None:
    res = harmonize([long_rows([("02270", "x", 70.0)])])
    assert res.values.fips.tolist() == ["02158"]
    assert res.values.value.tolist() == [70.0]
    assert list(res.values.columns) == LONG_COLUMNS


def test_split_only_legacy_reported() -> None:
    res = harmonize([long_rows([("02261", "x", 78.2), ("53033", "x", 80.0)])])
    assert set(res.values.fips) == {"53033"}
    assert list(res.legacy.columns) == LEGACY_COLUMNS
    assert sorted(res.legacy.fips) == ["02063", "02066"]
    row = res.legacy.iloc[0]
    assert row.legacy_fips == "02261"
    assert row.legacy_name == "Valdez-Cordova Census Area (former)"
    assert (row.value, row.ci_low, row.ci_high) == (78.2, 77.2, 79.2)
    assert len(res.warnings) == 1
    assert "x" in res.warnings[0] and "02261" in res.warnings[0]


def test_split_successors_reported_drops_legacy() -> None:
    res = harmonize([long_rows([("02261", "x", 78.2), ("02063", "x", 77.0), ("02066", "x", 79.0)])])
    assert sorted(res.values.fips) == ["02063", "02066"]
    assert res.legacy.empty
    assert res.warnings == []


def test_split_handled_per_indicator() -> None:
    res = harmonize(
        [
            long_rows(
                [("02261", "x", 1.0), ("02063", "y", 2.0), ("02066", "y", 3.0), ("02261", "y", 4.0)]
            )
        ]
    )
    assert sorted(res.legacy.indicator_id.unique()) == ["x"]
    assert sorted(res.values[res.values.indicator_id == "y"].fips) == ["02063", "02066"]


def test_multiple_source_frames_concatenated() -> None:
    res = harmonize([long_rows([("53033", "x", 1.0)]), long_rows([("53033", "y", 2.0)])])
    assert sorted(res.values.indicator_id) == ["x", "y"]


def test_null_value_survives() -> None:
    res = harmonize([long_rows([("53033", "x", float("nan"))])])
    assert math.isnan(res.values.value.iloc[0])


def test_duplicate_after_rename_raises() -> None:
    with pytest.raises(InputError, match="02158"):
        harmonize([long_rows([("02270", "x", 1.0), ("02158", "x", 2.0)])])


def test_pnw_only_keeps_alaska() -> None:
    df = long_rows([("02013", "x", 1.0), ("53033", "x", 1.0), ("06037", "x", 1.0)])
    assert pnw_only(df).fips.tolist() == ["02013", "53033"]


def test_split_null_successors_keep_legacy() -> None:
    nan = float("nan")
    res = harmonize([long_rows([("02261", "x", 78.2), ("02063", "x", nan), ("02066", "x", nan)])])
    assert sorted(res.legacy.fips) == ["02063", "02066"]
    assert "02261" not in set(res.values.fips)
    assert len(res.warnings) == 1


def test_legacy_year_carried() -> None:
    legacy = long_rows([("02261", "x", 78.2)]).assign(year=2023)
    res = harmonize([legacy])
    assert res.legacy.year.tolist() == [2023, 2023]


def test_legacy_with_null_successors() -> None:
    nan = float("nan")
    legacy = long_rows([("02261", "x", 78.2)]).assign(year=2023)
    res = harmonize([long_rows([("02063", "x", nan), ("02066", "x", nan)]), legacy])
    assert sorted(res.legacy.fips) == ["02063", "02066"]
    assert sorted(res.values.fips) == ["02063", "02066"]
    assert res.values.value.isna().all()


def test_empty_legacy_has_populated_dtypes() -> None:
    empty = harmonize([long_rows([("53033", "x", 80.0)])]).legacy
    populated = harmonize([long_rows([("02261", "x", 78.2), ("53033", "x", 80.0)])]).legacy
    assert empty.empty
    assert empty.dtypes.to_dict() == populated.dtypes.to_dict()
    assert list(empty.columns) == LEGACY_COLUMNS == list(LEGACY_DTYPES)


def test_empty_legacy_round_trips_like_populated(tmp_path: Path) -> None:
    empty = harmonize([long_rows([("53033", "x", 80.0)])]).legacy
    populated = harmonize([long_rows([("02261", "x", 78.2), ("53033", "x", 80.0)])]).legacy
    empty.to_parquet(tmp_path / "empty.parquet", index=False)
    populated.to_parquet(tmp_path / "populated.parquet", index=False)
    schema = {
        name: pq.read_schema(tmp_path / f"{name}.parquet").remove_metadata()
        for name in ("empty", "populated")
    }
    assert schema["empty"] == schema["populated"]
