"""Shared test helpers."""

from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path
from typing import Any

import geopandas as gpd
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry


def make_boundary_zip(
    path: Path, fips: list[str], geometries: dict[str, BaseGeometry] | None = None
) -> Path:
    """Write a Census-style county shapefile zip with one 0.5° square per FIPS (EPSG:4269).

    A FIPS in ``geometries`` gets that shape instead of its square.
    """
    shapes = geometries or {}
    gdf = gpd.GeoDataFrame(
        {
            "GEOID": fips,
            "STATEFP": [f[:2] for f in fips],
            "NAMELSAD": [f"County {f}" for f in fips],
        },
        geometry=[shapes.get(f, box(-120 + i, 45, -119.5 + i, 45.5)) for i, f in enumerate(fips)],
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


def make_indicator(id_: str, unit: str = "percent", direction: str = "higher_is_worse") -> Any:
    from pnw_health.indicators import Indicator

    return Indicator.model_validate(
        {
            "id": id_,
            "label": id_,
            "unit": unit,
            "source": "acs",
            "source_field": "X",
            "moe_field": None,
            "ci_level": None,
            "year": 2024,
            "category": "Social & Economic",
            "direction": direction,
            "description": "d",
        }
    )


def make_county_model(**overrides: Any) -> Any:
    """A county whose base value and contributions add up to its prediction."""
    from pnw_health.contract import CountyModel, ShapEntry

    fields: dict[str, Any] = {
        "actual": 78.0,
        "predicted": 77.0,
        "residual": 1.0,
        "se": 0.5,
        "threshold_75": 1.5,
        "threshold_90": 2.5,
        "base_value": 76.0,
        "flag": "none",
        "shap": [
            ShapEntry(feature="poverty_rate", value=10.0, contribution=0.75),
            ShapEntry(feature="uninsured_rate", value=None, contribution=0.25),
        ],
    }
    return CountyModel(**{**fields, **overrides})


def make_null_county_model() -> Any:
    from pnw_health.contract import CountyModel

    return CountyModel(
        actual=None,
        predicted=None,
        residual=None,
        se=None,
        threshold_75=None,
        threshold_90=None,
        base_value=None,
        flag="insufficient_data",
        shap=[],
    )


def make_model_file(counties: dict[str, Any], features: list[str] | None = None) -> Any:
    from pnw_health.contract import (
        BehaviorsComparison,
        Metrics,
        ModelCard,
        ModelFile,
        ModelMetricsBlock,
        RegionMetrics,
        Thresholds,
    )

    metrics = Metrics(rmse=1.23456, mae=1.0, r2=0.5, n=10)
    region = RegionMetrics(national=metrics, pnw=metrics)
    return ModelFile(
        metrics=ModelMetricsBlock(ridge=region, lightgbm=region),
        behaviors_comparison=BehaviorsComparison(main=region, behaviors=region, excluded_states=[]),
        global_importance=[],
        thresholds=Thresholds(sigma_model=1.23456, z_75=1.15, z_90=1.645),
        counties=counties,
        model_card=ModelCard(
            target="life_expectancy",
            training_counties=10,
            features=["poverty_rate"] if features is None else features,
            excluded_counties=[],
            excluded_feature_groups=[],
            n_folds=5,
            seed=42,
            lightgbm_params={"learning_rate": 0.03, "deterministic": True},
            lightgbm_version="4.0.0",
        ),
    )
