import json

import pandas as pd
import pytest

from pnw_health.config import RACE_GROUP_LABELS
from pnw_health.indicators import Indicator, load_catalog
from pnw_health.sources.chr import STRATA_COLUMNS
from pnw_health.strata import build_strata_file
from pnw_health.validate import DataValidationError
from tests.helpers import pnw_fips

NAN = float("nan")


@pytest.fixture
def catalog() -> list[Indicator]:
    return load_catalog()


@pytest.fixture
def county_fips() -> set[str]:
    return {*pnw_fips(), "02063"}


@pytest.fixture
def rows() -> pd.DataFrame:
    return pd.DataFrame(
        [
            ("53001", "life_expectancy", "white", 78.123456, 77.0, 79.0, False),
            ("53001", "premature_death", "aian", 12000.0, 9000.0, 15000.0, True),
            ("53003", "preventable_hospital_stays", "black", 2500.0, NAN, NAN, False),
            ("06037", "life_expectancy", "white", 80.0, 79.0, 81.0, False),
        ],
        columns=STRATA_COLUMNS,
    )


def with_race(catalog: list[Indicator]) -> list[Indicator]:
    return [i for i in catalog if i.race_groups]


def test_every_display_fips_and_group_present(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    strata = build_strata_file(rows, county_fips, catalog)
    assert list(strata.indicators) == [i.id for i in with_race(catalog)]
    for ind in with_race(catalog):
        entry = strata.indicators[ind.id]
        assert entry.groups == list(ind.race_groups or ())
        assert set(entry.counties) == county_fips
        for groups in entry.counties.values():
            assert list(groups) == entry.groups
    assert "06037" not in strata.indicators["life_expectancy"].counties


def test_values_cis_and_unreliable_carried(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    strata = build_strata_file(rows, county_fips, catalog)
    life = strata.indicators["life_expectancy"].counties["53001"]["white"]
    assert life is not None
    assert (life.v, life.lo, life.hi, life.unreliable) == (78.123456, 77.0, 79.0, False)
    death = strata.indicators["premature_death"].counties["53001"]["aian"]
    assert death is not None and death.unreliable is True
    stays = strata.indicators["preventable_hospital_stays"].counties["53003"]["black"]
    assert stays is not None
    assert (stays.v, stays.lo, stays.hi) == (2500.0, None, None)


def test_missing_row_is_none(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    strata = build_strata_file(rows, county_fips, catalog)
    for entry in strata.indicators.values():
        assert all(value is None for value in entry.counties["02063"].values())
    assert strata.indicators["life_expectancy"].counties["53001"]["asian"] is None


def test_groups_and_labels_in_display_order(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    strata = build_strata_file(rows, county_fips, catalog)
    assert (strata.dimension, strata.source, strata.year) == ("race", "chr", 2025)
    assert [(g.id, g.label) for g in strata.groups] == list(RACE_GROUP_LABELS.items())


def test_unknown_pnw_fips_raises(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    extra = pd.DataFrame(
        [("02261", "life_expectancy", "white", 78.0, NAN, NAN, False)], columns=STRATA_COLUMNS
    )
    with pytest.raises(DataValidationError, match="02261"):
        build_strata_file(pd.concat([rows, extra]), county_fips, catalog)


def test_duplicate_rows_raise(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    with pytest.raises(DataValidationError, match="life_expectancy/53001/white"):
        build_strata_file(pd.concat([rows, rows.iloc[[0]]]), county_fips, catalog)


def test_no_rank_fields_and_unreliable_omitted_when_false(
    rows: pd.DataFrame, county_fips: set[str], catalog: list[Indicator]
) -> None:
    dumped = json.loads(build_strata_file(rows, county_fips, catalog).model_dump_json())
    counties = dumped["indicators"]["life_expectancy"]["counties"]
    assert counties["53001"]["white"] == {"v": 78.123456, "lo": 77.0, "hi": 79.0}
    assert counties["02063"]["white"] is None
    death = dumped["indicators"]["premature_death"]["counties"]["53001"]["aian"]
    assert death["unreliable"] is True
    assert "rank" not in json.dumps(dumped)
