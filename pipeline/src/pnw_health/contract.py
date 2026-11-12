"""The export contract between pipeline and web app (spec §4).

These models are the single definition of the exported files. ``write_schemas`` emits
JSON Schema that the web app turns into TypeScript types; ``schema/`` at the repo root
is committed and a test fails if it drifts from these models.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    PositiveInt,
    RootModel,
    SerializerFunctionWrapHandler,
    model_serializer,
)

from pnw_health.indicators import Indicator, Unit

# Which way is better for a model target. Unlike the catalog's direction, never "neutral".
Direction = Literal["higher_is_better", "higher_is_worse"]


class SourceVintage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str
    year: int
    url: str


class Manifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str
    built_at: datetime
    sources: list[SourceVintage]
    indicators: list[Indicator]


class Legacy(BaseModel):
    """Value reported only for a retired FIPS that covers this county (spec §3)."""

    model_config = ConfigDict(extra="forbid")

    fips: str
    name: str
    year: int
    v: float | None
    lo: float | None
    hi: float | None


class ValueEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    v: float | None
    lo: float | None
    hi: float | None
    rank: int | None
    state_rank: int | None
    legacy: Legacy | None = None
    unreliable: bool = False

    @model_serializer(mode="wrap")
    def _omit_absent_optionals(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        data: dict[str, Any] = handler(self)
        if data.get("legacy") is None:
            data.pop("legacy", None)
        if not data.get("unreliable"):
            data.pop("unreliable", None)
        return data


class ValuesFile(RootModel[dict[str, dict[str, ValueEntry]]]):
    """``{indicator_id: {fips: ValueEntry}}``"""


class Metrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rmse: float
    mae: float
    r2: float
    n: int


class RegionMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    national: Metrics
    pnw: Metrics


class ExcludedState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state_fips: str
    counties: int
    reason: str


class BehaviorsComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")

    main: RegionMetrics
    behaviors: RegionMetrics
    excluded_states: list[ExcludedState]


Flag = Literal[
    "notably_better",
    "somewhat_better",
    "none",
    "somewhat_worse",
    "notably_worse",
    "insufficient_data",
]


class ShapEntry(BaseModel):
    """One factor associated with a county's prediction; ``value`` is None if imputed."""

    model_config = ConfigDict(extra="forbid")

    feature: str
    value: float | None
    contribution: float


class CountyModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actual: float | None
    predicted: float | None
    residual: float | None
    se: float | None
    threshold_75: float | None
    threshold_90: float | None
    base_value: float | None
    flag: Flag
    shap: list[ShapEntry]


class Thresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sigma_model: float
    z_75: float
    z_90: float


class ImportanceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature: str
    mean_abs_shap: float


class ExcludedCounty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fips: str
    reason: str


class ExcludedFeatureGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    reason: str


class ModelCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: str
    training_counties: int
    features: list[str]
    excluded_counties: list[ExcludedCounty]
    excluded_feature_groups: list[ExcludedFeatureGroup]
    n_folds: int
    seed: int
    lightgbm_params: dict[str, float | int | str | bool]
    lightgbm_version: str


class ModelMetricsBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ridge: RegionMetrics
    lightgbm: RegionMetrics


class TargetModel(BaseModel):
    """Everything the model says about one outcome."""

    model_config = ConfigDict(extra="forbid")

    label: str
    unit: Unit
    direction: Direction
    metrics: ModelMetricsBlock
    behaviors_comparison: BehaviorsComparison
    global_importance: list[ImportanceEntry]
    thresholds: Thresholds
    counties: dict[str, CountyModel]
    model_card: ModelCard


class PeerMethod(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: list[str]
    k: PositiveInt
    min_features: PositiveInt


class Peers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: PeerMethod
    counties: dict[str, list[str]]


class ModelFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    targets: dict[str, TargetModel]
    peers: Peers


SCHEMAS: dict[str, type[BaseModel]] = {
    "manifest.schema.json": Manifest,
    "model.schema.json": ModelFile,
    "values.schema.json": ValuesFile,
}


def write_schemas(schema_dir: Path) -> list[Path]:
    schema_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, model in SCHEMAS.items():
        path = schema_dir / name
        path.write_text(json.dumps(model.model_json_schema(), indent=2, sort_keys=True) + "\n")
        paths.append(path)
    return paths
