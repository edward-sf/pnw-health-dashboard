"""Curated indicator catalog: what the dashboard shows and where each value comes from."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.json_schema import SkipJsonSchema

from pnw_health.errors import InputError

Unit = Literal["percent", "dollars", "years", "rate_per_100k", "count"]
Category = Literal["Outcomes", "Behaviors", "Access", "Social & Economic", "Demographics"]
Direction = Literal["higher_is_better", "higher_is_worse", "neutral"]
Profile = Literal["population", "age_sex", "race", "other"]
Source = Literal["acs", "places", "chr"]

DEFAULT_CATALOG = Path(__file__).with_name("indicators.yaml")


class Indicator(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    label: str
    unit: Unit
    source: Source
    source_field: str
    moe_field: str | None
    ci_level: float | None
    year: int
    source_scale: SkipJsonSchema[float] = Field(default=1.0, exclude=True)
    category: Category
    direction: Direction
    description: str
    profile: Profile | None = None
    universe: str | None = None


def load_catalog(path: Path | None = None) -> list[Indicator]:
    """Load and validate the indicator catalog; raise InputError if it is invalid."""
    source = path or DEFAULT_CATALOG
    raw = yaml.safe_load(source.read_text())
    try:
        catalog = [Indicator.model_validate(entry) for entry in raw]
    except ValidationError as err:
        raise InputError(f"invalid indicator catalog {source}:\n{err}") from err
    dupes = sorted(i for i, n in Counter(ind.id for ind in catalog).items() if n > 1)
    if dupes:
        raise InputError(f"duplicate indicator ids in {source}: {', '.join(dupes)}")
    return catalog
