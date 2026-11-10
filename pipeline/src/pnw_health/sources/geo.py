"""Census cartographic county boundaries -> TopoJSON for the web map."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import httpx
from topojson.core.topology import Topology

from pnw_health.config import GEO_YEAR, STATES
from pnw_health.fetch import cached_get

BOUNDARY_URL = "https://www2.census.gov/geo/tiger/GENZ{year}/shp/cb_{year}_us_county_5m.zip"


def boundary_url(year: int = GEO_YEAR) -> str:
    return BOUNDARY_URL.format(year=year)


def fetch_boundaries(
    client: httpx.Client, raw_dir: Path, *, year: int = GEO_YEAR, refresh: bool = False
) -> Path:
    url = boundary_url(year)
    return cached_get(client, url, raw_dir / "geo" / url.rsplit("/", 1)[1], refresh=refresh)


def load_pnw_counties(zip_path: Path) -> gpd.GeoDataFrame:
    """Read the national county file and keep the PNW counties as fips/name/state/geometry."""
    gdf = gpd.read_file(zip_path, engine="pyogrio")
    gdf = gdf[gdf["STATEFP"].isin(STATES)]
    out = gpd.GeoDataFrame(
        {
            "fips": gdf["GEOID"].astype(str),
            "name": gdf["NAMELSAD"].astype(str),
            "state": gdf["STATEFP"].map(STATES),
        },
        geometry=gdf.geometry,
        crs=gdf.crs,
    ).to_crs("EPSG:4326")
    return out.sort_values("fips").reset_index(drop=True)


def to_topojson(
    gdf: gpd.GeoDataFrame, *, toposimplify: float = 0.002, prequantize: int = 100_000
) -> dict[str, Any]:
    """Encode counties as a TopoJSON dict with a single object named ``counties``."""
    topo = Topology(
        gdf[["fips", "name", "state", "geometry"]],
        object_name="counties",
        prequantize=prequantize,
        toposimplify=toposimplify,
    )
    result: dict[str, Any] = topo.to_dict()
    return result
