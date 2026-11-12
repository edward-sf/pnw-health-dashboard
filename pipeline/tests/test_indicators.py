from pathlib import Path
from typing import Any

import pytest

from pnw_health.errors import InputError
from pnw_health.indicators import load_catalog

EXPECTED_LABEL_FRAGMENTS = {
    "median_household_income": "Median household income (dollars)",
    "poverty_rate": "BELOW THE POVERTY LEVEL!!All people",
    "unemployment_rate": "Unemployment Rate",
    "bachelors_or_higher": "Bachelor's degree or higher",
    "uninsured_rate": "Civilian noninstitutionalized population!!No health insurance coverage",
    "broadband_households": "With a broadband Internet subscription",
    "age_65_plus": "Total population!!65 years and over",
    "pct_hispanic": "Hispanic or Latino (of any race)",
    "pct_white": "Not Hispanic or Latino!!White alone",
    "pct_black": "Not Hispanic or Latino!!Black or African American alone",
    "pct_aian": "Not Hispanic or Latino!!American Indian and Alaska Native alone",
    "pct_asian": "Not Hispanic or Latino!!Asian alone",
    "pct_nhpi": "Not Hispanic or Latino!!Native Hawaiian and Other Pacific Islander alone",
    "pct_two_or_more": "Not Hispanic or Latino!!Two or More Races",
}


def test_catalog_loads_and_ids_unique() -> None:
    cat = load_catalog()
    assert len(cat) == 37
    assert len({i.id for i in cat}) == 37
    assert set(EXPECTED_LABEL_FRAGMENTS) <= {i.id for i in cat}
    assert cat[0].id == "median_household_income"  # default indicator stays first


def test_catalog_acs_defaults() -> None:
    for ind in (i for i in load_catalog() if i.source == "acs"):
        assert ind.year == 2024
        assert ind.ci_level == 0.9


def test_places_defaults() -> None:
    places = [i for i in load_catalog() if i.source == "places"]
    assert len(places) == 12
    for ind in places:
        assert ind.unit == "percent"
        assert ind.moe_field is None
        assert ind.ci_level == 0.95
        assert "age-adjusted" in ind.description.lower()


def test_duplicate_ids_rejected(tmp_path: Path) -> None:
    entry = """
- id: dup
  label: Dup
  unit: percent
  source: acs
  source_field: DP03_0009PE
  moe_field: DP03_0009PM
  ci_level: 0.9
  year: 2024
  category: Social & Economic
  direction: higher_is_worse
  description: d
"""
    path = tmp_path / "cat.yaml"
    path.write_text(entry + entry)
    with pytest.raises(InputError, match="dup"):
        load_catalog(path)


def test_acs_fields_exist_and_labels_match(acs_variables: dict[str, Any]) -> None:
    for ind in (i for i in load_catalog() if i.source == "acs"):
        var = acs_variables[ind.source_field]
        assert EXPECTED_LABEL_FRAGMENTS[ind.id] in var["label"], ind.id
        assert var["label"].startswith("Percent!!" if ind.unit == "percent" else "Estimate!!")
        assert ind.moe_field in var["attributes"].split(","), ind.id


def test_chr_entries() -> None:
    chr_ = [i for i in load_catalog() if i.source == "chr"]
    assert len(chr_) == 11
    for ind in chr_:
        assert ind.year == 2025
        assert ind.moe_field is None
        assert ind.source_field.endswith("_rawvalue")
    scales = {i.id: i.source_scale for i in chr_}
    assert scales["life_expectancy"] == 1.0
    assert scales["low_birth_weight"] == 100.0
    assert scales["dentists"] == 100000.0


def test_demographics_are_neutral() -> None:
    demo = [i for i in load_catalog() if i.category == "Demographics"]
    assert demo
    assert all(i.direction == "neutral" for i in demo)


def test_invalid_catalog_entry_names_the_file(tmp_path: Path) -> None:
    path = tmp_path / "cat.yaml"
    path.write_text(
        """
- id: bad
  label: Bad
  unit: furlongs
  source: acs
  source_field: DP03_0009PE
  moe_field: DP03_0009PM
  ci_level: 0.9
  year: 2024
  category: Social & Economic
  direction: higher_is_worse
  description: d
"""
    )
    with pytest.raises(InputError, match="cat.yaml"):
        load_catalog(path)
