from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from pnw_health.indicators import Indicator, load_catalog
from pnw_health.model.config import BEHAVIORS, FEATURES, TARGETS
from pnw_health.model.features import (
    ModelDataError,
    build_table,
    check_features,
    check_targets,
    impute_fold,
)
from tests.helpers import make_indicator
from tests.model.synthetic import make_long

TARGET = TARGETS[0]


def _without(long: pd.DataFrame, fips: str, indicator: str | None = None) -> pd.DataFrame:
    mask = long["fips"] == fips
    if indicator is not None:
        mask &= long["indicator_id"] == indicator
    return long[~mask]


def test_county_with_no_features_is_dropped() -> None:
    long = make_long()
    long = long[~((long["fips"] == "53001") & long["indicator_id"].isin(FEATURES))]
    table = build_table(long, target=TARGET)
    assert "53001" in table.dropped
    assert "53001" not in table.frame.index


def test_behaviors_do_not_count_as_features_for_dropping() -> None:
    long = make_long()
    long = long[~((long["fips"] == "53001") & long["indicator_id"].isin(FEATURES))]
    assert (long[long["fips"] == "53001"]["indicator_id"].isin(BEHAVIORS)).any()
    assert "53001" in build_table(long, target=TARGET).dropped


def test_partially_missing_county_is_kept() -> None:
    long = _without(make_long(), "53001", "poverty_rate")
    frame = build_table(long, target=TARGET).frame
    assert "53001" in frame.index
    assert np.isnan(frame.loc["53001", "poverty_rate"])


def test_null_target_is_excluded() -> None:
    long = make_long()
    long.loc[(long["fips"] == "53001") & (long["indicator_id"] == TARGET), "value"] = np.nan
    table = build_table(long, target=TARGET)
    assert "53001" not in table.frame.index
    assert "53001" not in table.dropped


def test_state_and_fips_are_strings() -> None:
    table = build_table(make_long(), target=TARGET)
    assert "02013" in table.frame.index
    assert table.frame.loc["02013", "state"] == "02"
    assert table.frame.index.is_monotonic_increasing
    assert table.frame.index.name == "fips"


def test_frame_columns_and_target_ci() -> None:
    frame = build_table(make_long(), target=TARGET).frame
    assert list(frame.columns) == [
        *FEATURES,
        *BEHAVIORS,
        "target",
        "ci_low",
        "ci_high",
        "state",
    ]
    assert (frame["ci_high"] - frame["ci_low"]).round(6).eq(2.0).all()


def test_missing_indicator_fails() -> None:
    long = make_long()
    long = long[long["indicator_id"] != "poverty_rate"]
    with pytest.raises(ModelDataError, match="poverty_rate"):
        build_table(long, target=TARGET)


@pytest.mark.parametrize("category", ["Behaviors", "Demographics", "Outcomes"])
def test_check_features_rejects_excluded(category: str) -> None:
    ind = make_indicator("bad_feature")
    bad = ind.model_copy(update={"category": category})
    with pytest.raises(ModelDataError, match="bad_feature"):
        check_features(["bad_feature"], [bad])


def test_check_features_rejects_unknown() -> None:
    with pytest.raises(ModelDataError, match="nope"):
        check_features(["nope"], load_catalog())


def test_real_features_pass() -> None:
    check_features(FEATURES, load_catalog())


def test_held_out_extreme_does_not_change_medians() -> None:
    train = pd.DataFrame({"x": [1.0, 2.0, 3.0]})
    test = pd.DataFrame({"x": [1e9]})
    _, _, medians = impute_fold(train, test)
    assert medians["x"] == 2.0


def test_impute_fills_test_from_train() -> None:
    train = pd.DataFrame({"x": [1.0, 2.0, 3.0, np.nan]})
    test = pd.DataFrame({"x": [np.nan, 10.0]})
    train_f, test_f, _ = impute_fold(train, test)
    assert test_f["x"].tolist() == [2.0, 10.0]
    assert train_f["x"].tolist() == [1.0, 2.0, 3.0, 2.0]
    assert np.isnan(train.loc[3, "x"])


def test_all_nan_training_column_fails() -> None:
    train = pd.DataFrame({"x": [1.0, 2.0], "poverty_rate": [np.nan, np.nan]})
    test = pd.DataFrame({"x": [1.0], "poverty_rate": [1.0]})
    with pytest.raises(ModelDataError, match="poverty_rate"):
        impute_fold(train, test)


def test_asymmetric_target_ci() -> None:
    long = make_long()
    row = (long["indicator_id"] == TARGET) & (long["fips"] == "53001")
    value = float(long.loc[row, "value"].iloc[0])
    long.loc[row, "ci_low"] = value - 1.0
    long.loc[row, "ci_high"] = value + 3.0
    frame = build_table(long, target=TARGET).frame
    assert frame.loc["53001", "ci_low"] == value - 1.0
    assert frame.loc["53001", "ci_high"] == value + 3.0


def test_duplicate_rows_raise() -> None:
    long = make_long()
    long = pd.concat([long, long.iloc[[0]]], ignore_index=True)
    first = long.iloc[0]
    with pytest.raises(ModelDataError, match=f"{first.fips}/{first.indicator_id}"):
        build_table(long, target=TARGET)


def test_dropped_is_tuple() -> None:
    assert isinstance(build_table(make_long(), target=TARGET).dropped, tuple)


@pytest.fixture
def catalog() -> list[Indicator]:
    return load_catalog()


def _edited(catalog: list[Indicator], target: str, **changes: object) -> list[Indicator]:
    return [i.model_copy(update=changes) if i.id == target else i for i in catalog]


def test_check_targets_accepts_the_configured_targets(catalog: list[Indicator]) -> None:
    check_targets(TARGETS, catalog)


def test_check_targets_rejects_unknown_id(catalog: list[Indicator]) -> None:
    with pytest.raises(ModelDataError, match="'nope' is not in the indicator catalog"):
        check_targets(["nope"], catalog)


def test_check_targets_rejects_non_outcome(catalog: list[Indicator]) -> None:
    with pytest.raises(ModelDataError, match="category"):
        check_targets(["poverty_rate"], catalog)


def test_check_targets_rejects_missing_ci_level(catalog: list[Indicator]) -> None:
    with pytest.raises(ModelDataError, match="ci_level"):
        check_targets(TARGETS, _edited(catalog, "injury_deaths", ci_level=None))


def test_check_targets_rejects_neutral(catalog: list[Indicator]) -> None:
    with pytest.raises(ModelDataError, match="neutral"):
        check_targets(TARGETS, _edited(catalog, "injury_deaths", direction="neutral"))
