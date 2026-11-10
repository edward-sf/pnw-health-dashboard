"""Curated indicator catalog: what the dashboard shows and where each value comes from."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict

Unit = Literal["percent", "dollars", "years", "rate_per_100k", "count"]
Category = Literal["Outcomes", "Behaviors", "Access", "Social & Economic", "Demographics"]
Direction = Literal["higher_is_better", "higher_is_worse", "neutral"]
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
    category: Category
    direction: Direction
    description: str


def load_catalog(path: Path | None = None) -> list[Indicator]:
    """Load and validate the indicator catalog; raise ValueError on duplicate ids."""
    raw = yaml.safe_load((path or DEFAULT_CATALOG).read_text())
    catalog = [Indicator.model_validate(entry) for entry in raw]
    dupes = sorted(i for i, n in Counter(ind.id for ind in catalog).items() if n > 1)
    if dupes:
        raise ValueError(f"duplicate indicator ids: {', '.join(dupes)}")
    return catalog
