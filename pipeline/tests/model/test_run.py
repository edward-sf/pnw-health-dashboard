from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from pnw_health.config import state_abbr
from pnw_health.contract import ExcludedCounty, ExcludedFeatureGroup, ModelFile
from pnw_health.indicators import load_catalog
from pnw_health.model.config import FEATURES, TARGET
from pnw_health.model.cv import assign_folds, fit_lightgbm_oof
from pnw_health.model.explain import global_importance
from pnw_health.model.features import ModelDataError, build_table
from pnw_health.model.flags import se_from_ci, sigma_model_sq
from pnw_health.model.run import run_model
from tests.model.synthetic import make_long

CATALOG = load_catalog()
NUMERIC_FIELDS = (
    "actual",
    "predicted",
    "residual",
    "se",
    "threshold_75",
    "threshold_90",
    "base_value",
)
NULL_TARGET = "53001"
NO_CI = "53003"
IMPUTED = "41001"
DROPPED = "06001"


def edited_long() -> pd.DataFrame:
    """Synthetic data with one county of each awkward kind."""
    long = make_long()
    is_target = long["indicator_id"] == TARGET
    long.loc[is_target & (long["fips"] == NULL_TARGET), ["value", "ci_low", "ci_high"]] = np.nan
    long.loc[is_target & (long["fips"] == NO_CI), ["ci_low", "ci_high"]] = np.nan
    long.loc[(long["indicator_id"] == FEATURES[0]) & (long["fips"] == IMPUTED), "value"] = np.nan
    long.loc[long["indicator_id"].isin(FEATURES) & (long["fips"] == DROPPED), "value"] = np.nan
    return long


@pytest.fixture(scope="module")
def long() -> pd.DataFrame:
    return edited_long()


@pytest.fixture(scope="module")
def model(long: pd.DataFrame) -> ModelFile:
    return run_model(long, CATALOG)


def test_every_pnw_county_present(long: pd.DataFrame, model: ModelFile) -> None:
    expected = {f for f in long["fips"].unique() if state_abbr(f) is not None}
    assert set(model.counties) == expected
    assert "02013" in model.counties


def test_null_target_is_insufficient_data(model: ModelFile) -> None:
    county = model.counties[NULL_TARGET]
    assert county.flag == "insufficient_data"
    assert all(getattr(county, field) is None for field in NUMERIC_FIELDS)
    assert county.shap == []


def test_shap_lists_every_feature_and_sums_to_predicted(model: ModelFile) -> None:
    for fips, county in model.counties.items():
        if fips == NULL_TARGET:
            continue
        assert {entry.feature for entry in county.shap} == set(FEATURES)
        assert county.base_value is not None
        total = county.base_value + sum(entry.contribution for entry in county.shap)
        assert total == pytest.approx(county.predicted, abs=1e-6)


def test_residual_sign(model: ModelFile) -> None:
    county = model.counties["53005"]
    assert county.actual is not None
    assert county.predicted is not None
    assert county.residual == county.actual - county.predicted


def test_model_card_lists_features(long: pd.DataFrame, model: ModelFile) -> None:
    card = model.model_card
    assert card.target == TARGET
    assert card.features == list(FEATURES)
    assert card.training_counties == len(build_table(long).frame)


def test_card_lists_dropped_counties(model: ModelFile) -> None:
    assert model.model_card.excluded_counties == [
        ExcludedCounty(
            fips=DROPPED,
            reason=(
                "Target reported but no features available; for Connecticut, CHR reports "
                "former counties while ACS reports planning regions."
            ),
        )
    ]


def test_card_lists_excluded_feature_groups(model: ModelFile) -> None:
    assert model.model_card.excluded_feature_groups == [
        ExcludedFeatureGroup(
            category="Behaviors", reason="Health behaviors closely restate the outcome."
        ),
        ExcludedFeatureGroup(
            category="Demographics",
            reason=(
                "Race and ethnicity shares act as proxies for structural factors, "
                "so attributions would mislead."
            ),
        ),
    ]


def test_imputed_feature_value_is_none(long: pd.DataFrame, model: ModelFile) -> None:
    by_feature = {entry.feature: entry for entry in model.counties[IMPUTED].shap}
    assert by_feature[FEATURES[0]].value is None
    frame = build_table(long).frame
    assert by_feature[FEATURES[1]].value == frame.loc[IMPUTED, FEATURES[1]]


def test_missing_ci_has_null_se_but_a_threshold(model: ModelFile) -> None:
    county = model.counties[NO_CI]
    assert county.se is None
    assert county.threshold_75 is not None
    assert county.flag != "insufficient_data"


def test_thresholds_and_importance_use_full_training_population(
    long: pd.DataFrame, model: ModelFile
) -> None:
    frame = build_table(long).frame
    oof = fit_lightgbm_oof(frame, FEATURES, assign_folds(frame["state"]))
    residuals = frame["target"] - oof.predicted
    se = se_from_ci(frame["ci_low"], frame["ci_high"])
    sigma_sq = sigma_model_sq(residuals, se)

    assert model.thresholds.sigma_model == pytest.approx(math.sqrt(sigma_sq))
    county = model.counties["53005"]
    own_se_sq = float(se["53005"] ** 2)
    assert county.threshold_75 == pytest.approx(1.150 * math.sqrt(sigma_sq + own_se_sq))
    no_ci_scale = math.sqrt(sigma_sq + float((se**2).mean()))
    assert model.counties[NO_CI].threshold_90 == pytest.approx(1.645 * no_ci_scale)
    assert [(e.feature, e.mean_abs_shap) for e in model.global_importance] == global_importance(
        oof.contributions
    )


def test_rejects_feature_outside_catalog(long: pd.DataFrame) -> None:
    catalog = [ind for ind in CATALOG if ind.id != FEATURES[0]]
    with pytest.raises(ModelDataError, match=FEATURES[0]):
        run_model(long, catalog)
