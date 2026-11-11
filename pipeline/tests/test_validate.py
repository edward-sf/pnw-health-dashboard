import pandas as pd
import pytest

from pnw_health.harmonize import LEGACY_COLUMNS
from pnw_health.indicators import Indicator
from pnw_health.long import LONG_COLUMNS
from pnw_health.validate import DataValidationError, validate_display
from tests.helpers import pnw_fips


def indicator(id_: str, unit: str) -> Indicator:
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
            "direction": "higher_is_worse",
            "description": "d",
        }
    )


CATALOG = [indicator("pct", "percent"), indicator("usd", "dollars")]


def valid_values(fips: list[str]) -> pd.DataFrame:
    rows = [
        {
            "fips": f,
            "indicator_id": ind.id,
            "year": 2024,
            "value": 50.0,
            "ci_low": None,
            "ci_high": None,
            "source": "acs",
        }
        for f in fips
        for ind in CATALOG
    ]
    return pd.DataFrame(rows, columns=LONG_COLUMNS)


def problems(values: pd.DataFrame, counties: set[str]) -> list[str]:
    with pytest.raises(DataValidationError) as err:
        validate_display(values, counties, CATALOG)
    return err.value.problems


def test_valid_data_passes() -> None:
    fips = pnw_fips()
    validate_display(valid_values(fips), set(fips), CATALOG)


def test_nan_values_allowed() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[0, "value"] = float("nan")
    validate_display(v, set(fips), CATALOG)


def test_county_count_per_state() -> None:
    fips = [f for f in pnw_fips() if f != "02001"]
    assert problems(valid_values(fips), set(fips)) == ["county count AK: expected 30, got 29"]


def test_non_pnw_county_in_boundaries() -> None:
    fips = pnw_fips()
    found = problems(valid_values(fips), set(fips) | {"06037"})
    assert found == ["boundaries include non-PNW counties: 06037"]


def test_unknown_fips_in_values() -> None:
    fips = pnw_fips()
    v = pd.concat([valid_values(fips), valid_values(["53999"]).iloc[:1]])
    assert problems(v, set(fips)) == ["values reference unknown counties: 53999"]


def test_duplicate_keys() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v = pd.concat([v, v.iloc[:1]])
    assert problems(v, set(fips)) == ["duplicate (fips, indicator_id): 53001/pct"]


def test_percent_out_of_range() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[(v.fips == "53001") & (v.indicator_id == "pct"), "value"] = 101.0
    assert problems(v, set(fips)) == ["pct: 1 value(s) outside [0, 100] (e.g. 53001=101.0)"]


def test_negative_dollars() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[(v.fips == "41001") & (v.indicator_id == "usd"), "value"] = -666666666.0
    assert problems(v, set(fips)) == ["usd: 1 value(s) negative (e.g. 41001=-666666666.0)"]


def test_indicator_without_data() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v.loc[v.indicator_id == "usd", "value"] = float("nan")
    assert problems(v, set(fips)) == ["usd: no non-null values"]


def test_collects_all_problems() -> None:
    fips = [f for f in pnw_fips() if f != "02001"]
    v = valid_values(fips)
    v.loc[v.index[0], "value"] = 150.0
    found = problems(v, set(fips))
    assert len(found) == 2  # AK count, out-of-range
    assert "\n" in str(DataValidationError(found))


def years_indicator() -> Indicator:
    return indicator("life", "years")


@pytest.mark.parametrize("bad", [-1.0, 121.0])
def test_years_out_of_range(bad: float) -> None:
    fips = pnw_fips()
    catalog = [years_indicator()]
    v = valid_values(fips)
    v = v[v.indicator_id == "pct"].assign(indicator_id="life", value=65.0)
    v.loc[v.index[0], "value"] = bad
    with pytest.raises(DataValidationError) as err:
        validate_display(v, set(fips), catalog)
    assert any("outside [0, 120]" in p for p in err.value.problems)


def test_years_in_range() -> None:
    fips = pnw_fips()
    v = valid_values(fips)
    v = v[v.indicator_id == "pct"].assign(indicator_id="life", value=65.0)
    validate_display(v, set(fips), [years_indicator()])


def legacy_row(indicator_id: str, value: float) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "fips": "02063",
                "indicator_id": indicator_id,
                "legacy_fips": "02261",
                "legacy_name": "Valdez-Cordova Census Area (former)",
                "year": 2023,
                "value": value,
                "ci_low": None,
                "ci_high": None,
            }
        ],
        columns=LEGACY_COLUMNS,
    )


def test_legacy_out_of_range() -> None:
    fips = pnw_fips()
    with pytest.raises(DataValidationError) as err:
        validate_display(valid_values(fips), set(fips), CATALOG, legacy_row("pct", 447.0))
    assert err.value.problems == ["pct legacy: 1 value(s) outside [0, 100] (e.g. 02063=447.0)"]


def test_legacy_in_range_passes() -> None:
    fips = pnw_fips()
    validate_display(valid_values(fips), set(fips), CATALOG, legacy_row("pct", 4.5))
