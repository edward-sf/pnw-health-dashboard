"""Curated indicator catalog: what the dashboard shows and where each value comes from."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic.json_schema import SkipJsonSchema

from pnw_health.errors import InputError

Unit = Literal["percent", "dollars", "years", "rate_per_100k", "count"]
Category = Literal["Outcomes", "Behaviors", "Access", "Social & Economic", "Demographics"]
Direction = Literal["higher_is_better", "higher_is_worse", "neutral"]
Profile = Literal["population", "age_sex", "race", "other"]
Source = Literal["acs", "places", "chr"]
# CHR race and ethnicity groups (M10 spec §2), in display order.
RaceGroup = Literal["aian", "asian", "black", "hispanic", "nhopi", "white", "tom"]

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
    # The groups CHR breaks this measure down by; pipeline-only, exported in strata.json.
    race_groups: SkipJsonSchema[tuple[RaceGroup, ...] | None] = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def _race_groups_only_on_chr(self) -> Self:
        if self.race_groups is not None:
            if self.source != "chr":
                raise ValueError(f"{self.id}: race_groups is only allowed on source chr")
            if len(set(self.race_groups)) != len(self.race_groups):
                raise ValueError(f"{self.id}: race_groups has duplicates")
        return self


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
