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
    "total_population": "Total population",
    "age_under_18": "Under 18 years",
    "pct_female": "Female",
    "pct_disability": "With a disability",
    "pct_veterans": "Civilian veterans",
    "pct_foreign_born": "Total population!!Foreign-born",
    "pct_limited_english": "Speak English less than",
}


def test_catalog_loads_and_ids_unique() -> None:
    cat = load_catalog()
    assert len(cat) == 44
    assert len({i.id for i in cat}) == 44
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


RACE_IDS = [
    "pct_hispanic",
    "pct_white",
    "pct_black",
    "pct_aian",
    "pct_asian",
    "pct_nhpi",
    "pct_two_or_more",
]
NEW_DEMOGRAPHICS = [
    "total_population",
    "age_under_18",
    "pct_female",
    "pct_disability",
    "pct_veterans",
    "pct_foreign_born",
    "pct_limited_english",
]


def test_every_demographics_indicator_has_a_profile() -> None:
    for ind in load_catalog():
        if ind.category == "Demographics":
            assert ind.profile is not None, ind.id


def test_one_population_indicator_with_count_unit() -> None:
    pop = [i for i in load_catalog() if i.profile == "population"]
    assert [(i.id, i.unit) for i in pop] == [("total_population", "count")]


def test_profile_groups_in_display_order() -> None:
    catalog = load_catalog()

    def by(profile: str) -> list[str]:
        return [i.id for i in catalog if i.profile == profile]

    assert by("age_sex") == ["age_under_18", "age_65_plus", "pct_female"]
    assert by("other") == [
        "pct_disability",
        "pct_veterans",
        "pct_foreign_born",
        "pct_limited_english",
    ]
    assert by("race") == RACE_IDS


def test_new_demographics_are_neutral_acs_2024() -> None:
    by_id = {i.id: i for i in load_catalog()}
    for id_ in NEW_DEMOGRAPHICS:
        ind = by_id[id_]
        assert (ind.source, ind.year, ind.direction, ind.category) == (
            "acs",
            2024,
            "neutral",
            "Demographics",
        )
        assert ind.moe_field and ind.ci_level == 0.9


def test_age_65_plus_stays_a_model_feature_category() -> None:
    by_id = {i.id: i for i in load_catalog()}
    assert by_id["age_65_plus"].category == "Social & Economic"


def test_universe_set_where_the_row_would_mislead() -> None:
    u = {i.id: i.universe for i in load_catalog() if i.universe}
    assert u == {
        "pct_disability": "Civilian noninstitutionalized population",
        "pct_veterans": "Civilian population 18 and over",
        "pct_limited_english": "Population 5 and over",
    }
