import json
import math
from pathlib import Path

import httpx
import pytest

from pnw_health.fetch import FetchError, make_client
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS
from pnw_health.sources import places
from pnw_health.sources.places import fetch_places, parse_places, places_cache_path, places_url
from tests.helpers import make_indicator


def places_indicator(id_: str = "diabetes", field: str = "DIABETES", year: int = 2023) -> Indicator:
    return make_indicator(id_).model_copy(
        update={"source": "places", "source_field": field, "year": year, "ci_level": 0.95}
    )


ROW = {
    "locationid": "53033",
    "measureid": "DIABETES",
    "year": "2023",
    "data_value": "7.2",
    "low_confidence_limit": "6.4",
    "high_confidence_limit": "7.9",
}
BAD_BODIES = {
    "html": b"<html>maintenance</html>",
    "object": b"{}",
    "empty-list": b"[]",
    "no-locationid": json.dumps([{k: v for k, v in ROW.items() if k != "locationid"}]).encode(),
}


def write_rows(tmp_path: Path, rows: list[dict[str, str]]) -> Path:
    path = tmp_path / "places.json"
    path.write_text(json.dumps(rows))
    return path


def test_url() -> None:
    assert places_url() == "https://data.cdc.gov/resource/swc5-untb.json"


def test_parse_long_format(tmp_path: Path) -> None:
    df = parse_places(write_rows(tmp_path, [ROW]), [places_indicator()])
    assert list(df.columns) == LONG_COLUMNS
    assert len(df) == 1
    row = df.iloc[0]
    assert row.fips == "53033"
    assert row.indicator_id == "diabetes"
    assert row.year == 2023
    assert row.value == 7.2
    assert row.ci_low == 6.4
    assert row.ci_high == 7.9
    assert row.source == "places"


def test_absent_keys_are_null(tmp_path: Path) -> None:
    sparse = {"locationid": "53033", "measureid": "DIABETES", "year": "2023"}
    df = parse_places(write_rows(tmp_path, [sparse]), [places_indicator()])
    row = df.iloc[0]
    assert math.isnan(row.value)
    assert math.isnan(row.ci_low)
    assert math.isnan(row.ci_high)


def test_year_mismatch_rejected(tmp_path: Path) -> None:
    path = write_rows(tmp_path, [{**ROW, "year": "2022"}])
    with pytest.raises(FetchError, match="year"):
        parse_places(path, [places_indicator()])


def test_unrequested_measures_ignored(tmp_path: Path) -> None:
    path = write_rows(tmp_path, [ROW, {**ROW, "measureid": "OBESITY"}])
    assert len(parse_places(path, [places_indicator()])) == 1


def test_cache_path_depends_on_measures(tmp_path: Path) -> None:
    a = places_cache_path(tmp_path, [places_indicator()])
    b = places_cache_path(tmp_path, [places_indicator(), places_indicator("copd", "COPD")])
    assert a.parent == tmp_path / "places"
    assert a.name.startswith("places_2025_") and a != b


def test_fetch_query(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[ROW])

    catalog = [places_indicator(), places_indicator("copd", "COPD")]
    with make_client(httpx.MockTransport(handler)) as client:
        path = fetch_places(client, tmp_path, catalog)
    assert path.exists()
    params = seen[0].url.params
    where = params["$where"]
    assert "datavaluetypeid='AgeAdjPrv'" in where
    assert "'DIABETES'" in where and "'COPD'" in where
    assert params["$limit"] == str(places.PLACES_LIMIT)
    assert params["$order"] == "locationid,measureid"
    assert "locationid" in params["$select"]
    # A cached file is reused without another request.
    with make_client(httpx.MockTransport(handler)) as client:
        fetch_places(client, tmp_path, catalog)
    assert len(seen) == 1


def test_truncated_response_rejected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(places, "PLACES_LIMIT", 1)
    handler = lambda r: httpx.Response(200, json=[ROW])  # noqa: E731
    with make_client(httpx.MockTransport(handler)) as client, pytest.raises(FetchError) as err:
        fetch_places(client, tmp_path, [places_indicator()])
    assert "truncated" in str(err.value)
    assert not list((tmp_path / "places").glob("*.json"))


@pytest.mark.parametrize("body", BAD_BODIES.values(), ids=BAD_BODIES.keys())
def test_bad_bodies_not_cached(tmp_path: Path, body: bytes) -> None:
    handler = lambda r: httpx.Response(200, content=body)  # noqa: E731
    with make_client(httpx.MockTransport(handler)) as client, pytest.raises(FetchError):
        fetch_places(client, tmp_path, [places_indicator()])
    assert not list((tmp_path / "places").glob("*.json"))
