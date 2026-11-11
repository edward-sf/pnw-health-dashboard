"""The export contract between pipeline and web app (spec §4).

These models are the single definition of the exported files. ``write_schemas`` emits
JSON Schema that the web app turns into TypeScript types; ``schema/`` at the repo root
is committed and a test fails if it drifts from these models.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    RootModel,
    SerializerFunctionWrapHandler,
    model_serializer,
)

from pnw_health.indicators import Indicator


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


SCHEMAS: dict[str, type[BaseModel]] = {
    "manifest.schema.json": Manifest,
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
