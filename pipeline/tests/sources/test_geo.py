import io
import json
import zipfile
from pathlib import Path

import geopandas as gpd
import httpx
import pytest
import topojson
from shapely.geometry import MultiPolygon, box

from pnw_health.fetch import FetchError, make_client
from pnw_health.sources.geo import fetch_boundaries, load_pnw_counties, to_topojson
from tests.helpers import make_boundary_zip


def test_load_filters_and_columns(tmp_path: Path) -> None:
    zp = make_boundary_zip(tmp_path / "b.zip", ["02013", "53033", "06037"])
    gdf = load_pnw_counties(zp)
    assert gdf.fips.tolist() == ["02013", "53033"]
    assert list(gdf.columns) == ["fips", "name", "state", "geometry"]
    assert gdf.state.tolist() == ["AK", "WA"]
    assert gdf.name.tolist() == ["County 02013", "County 53033"]
    assert gdf.crs.to_epsg() == 4326


def test_topojson_object_and_properties(tmp_path: Path) -> None:
    gdf = load_pnw_counties(make_boundary_zip(tmp_path / "b.zip", ["41001", "16001"]))
    topo = to_topojson(gdf)
    assert topo["type"] == "Topology"
    json.dumps(topo)  # export writes this as JSON
    geoms = topo["objects"]["counties"]["geometries"]
    assert len(geoms) == 2
    for g in geoms:
        assert set(g["properties"]) == {"fips", "name", "state"}


def test_antimeridian_parts_preserved() -> None:
    aleutians = MultiPolygon([box(172, 52, 173, 53), box(-176, 51, -175, 52)])
    gdf = gpd.GeoDataFrame(
        {"fips": ["02016"], "name": ["Aleutians West"], "state": ["AK"]},
        geometry=[aleutians],
        crs="EPSG:4326",
    )
    back = topojson.Topology(to_topojson(gdf), object_name="counties").to_gdf()
    geom = back.geometry.iloc[0]
    minx, _, maxx, _ = geom.bounds
    assert minx < -170
    assert maxx > 170
    assert len(geom.geoms) == 2


def test_antimeridian_survives_load_and_quantize(tmp_path: Path) -> None:
    aleutians = MultiPolygon([box(172, 52, 173, 53), box(-176, 51, -175, 52)])
    zp = make_boundary_zip(tmp_path / "b.zip", ["02016", "53033"], {"02016": aleutians})
    counties = load_pnw_counties(zp)
    back = topojson.Topology(to_topojson(counties), object_name="counties").to_gdf()
    by_fips = dict(zip(back.fips, back.geometry, strict=True))
    geom = by_fips["02016"]
    minx, _, maxx, _ = geom.bounds
    assert len(geom.geoms) == 2
    assert minx < -170
    assert maxx > 170
    mainland = by_fips["53033"].bounds
    for got, want in zip(mainland, (-119, 45, -118.5, 45.5), strict=True):
        assert abs(got - want) < 0.01


def test_fetch_boundaries_url(tmp_path: Path) -> None:
    seen: list[str] = []
    body = make_boundary_zip(tmp_path / "src" / "b.zip", ["53033"]).read_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, content=body)

    with make_client(httpx.MockTransport(handler)) as client:
        path = fetch_boundaries(client, tmp_path)
    assert seen == ["/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip"]
    assert path == tmp_path / "geo" / "cb_2024_us_county_5m.zip"


def zip_without_shapefile() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "no shapes here")
    return buf.getvalue()


BAD_ZIPS = {"html": b"<html>maintenance</html>", "no-shapefile": zip_without_shapefile()}


@pytest.mark.parametrize("body", BAD_ZIPS.values(), ids=BAD_ZIPS.keys())
def test_bad_boundary_download_is_not_cached(tmp_path: Path, body: bytes) -> None:
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=body))
    with make_client(transport) as client, pytest.raises(FetchError):
        fetch_boundaries(client, tmp_path)
    assert not (tmp_path / "geo" / "cb_2024_us_county_5m.zip").exists()


@pytest.mark.parametrize("body", BAD_ZIPS.values(), ids=BAD_ZIPS.keys())
def test_bad_existing_boundary_cache_says_refresh(tmp_path: Path, body: bytes) -> None:
    path = tmp_path / "b.zip"
    path.write_bytes(body)
    with pytest.raises(FetchError, match="--refresh"):
        load_pnw_counties(path)
