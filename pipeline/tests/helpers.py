"""Shared test helpers."""

from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
from shapely.geometry import box


def make_boundary_zip(path: Path, fips: list[str]) -> Path:
    """Write a Census-style county shapefile zip with one 0.5° square per FIPS (EPSG:4269)."""
    gdf = gpd.GeoDataFrame(
        {
            "GEOID": fips,
            "STATEFP": [f[:2] for f in fips],
            "NAMELSAD": [f"County {f}" for f in fips],
        },
        geometry=[box(-120 + i, 45, -119.5 + i, 45.5) for i in range(len(fips))],
        crs="EPSG:4269",
    )
    with tempfile.TemporaryDirectory() as tmp:
        shp = Path(tmp) / "cb_test_county.shp"
        gdf.to_file(shp, engine="pyogrio")
        path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path, "w") as zf:
            for part in Path(tmp).iterdir():
                zf.write(part, part.name)
    return path


def pnw_fips() -> list[str]:
    """149 synthetic county FIPS with the real per-state counts (WA 39, OR 36, ID 44, AK 30)."""
    counts = {"53": 39, "41": 36, "16": 44, "02": 30}
    return [f"{st}{2 * i + 1:03d}" for st, n in counts.items() for i in range(n)]
