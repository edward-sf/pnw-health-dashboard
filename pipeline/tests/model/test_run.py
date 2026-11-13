from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from pnw_health.config import state_abbr
from pnw_health.contract import ExcludedCounty, ExcludedFeatureGroup, ModelFile, TargetModel
from pnw_health.indicators import load_catalog
from pnw_health.model.config import FEATURES, PEER_K, PEER_MIN_FEATURES, TARGETS
from pnw_health.model.cv import assign_folds, fit_lightgbm_oof
from pnw_health.model.explain import global_importance
from pnw_health.model.features import ModelDataError, build_table
from pnw_health.model.flags import se_from_ci, sigma_model_sq
from pnw_health.model.run import build_peers, run_model
from tests.model.synthetic import make_long

CATALOG = load_catalog()
TARGET = TARGETS[0]
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
def full_model(long: pd.DataFrame) -> ModelFile:
    return run_model(long, CATALOG)


@pytest.fixture(scope="module")
def model(full_model: TargetModel) -> TargetModel:
    return full_model.targets[TARGET]


def test_every_pnw_county_present(long: pd.DataFrame, model: TargetModel) -> None:
    expected = {f for f in long["fips"].unique() if state_abbr(f) is not None}
    assert set(model.counties) == expected
    assert "02013" in model.counties


def test_null_target_is_insufficient_data(model: TargetModel) -> None:
    county = model.counties[NULL_TARGET]
    assert county.flag == "insufficient_data"
    assert all(getattr(county, field) is None for field in NUMERIC_FIELDS)
    assert county.shap == []


def test_shap_lists_every_feature_and_sums_to_predicted(model: TargetModel) -> None:
    for fips, county in model.counties.items():
        if fips == NULL_TARGET:
            continue
        assert {entry.feature for entry in county.shap} == set(FEATURES)
        assert county.base_value is not None
        total = county.base_value + sum(entry.contribution for entry in county.shap)
        assert total == pytest.approx(county.predicted, abs=1e-6)


def test_residual_sign(model: TargetModel) -> None:
    county = model.counties["53005"]
    assert county.actual is not None
    assert county.predicted is not None
    assert county.residual == county.actual - county.predicted


def test_model_card_lists_features(long: pd.DataFrame, model: TargetModel) -> None:
    card = model.model_card
    assert card.target == TARGET
    assert card.features == list(FEATURES)
    assert card.training_counties == len(build_table(long, target=TARGET).frame)


def test_card_lists_dropped_counties(model: TargetModel) -> None:
    assert model.model_card.excluded_counties == [
        ExcludedCounty(
            fips=DROPPED,
            reason=(
                "Target reported but no features available; for Connecticut, CHR reports "
                "former counties while ACS reports planning regions."
            ),
        )
    ]


def test_card_lists_excluded_feature_groups(model: TargetModel) -> None:
    assert model.model_card.excluded_feature_groups == [
        ExcludedFeatureGroup(
            category="Behaviors", reason="Health behaviors closely restate the outcome."
        ),
        ExcludedFeatureGroup(
            category="Demographics",
            reason=(
                "Race and ethnicity shares act as proxies for structural factors, "
                "so attributions would mislead. The other population measures (size, age, sex, "
                "disability, veterans, birthplace and English ability) are shown as context only."
            ),
        ),
    ]


def test_imputed_feature_value_is_none(long: pd.DataFrame, model: TargetModel) -> None:
    by_feature = {entry.feature: entry for entry in model.counties[IMPUTED].shap}
    assert by_feature[FEATURES[0]].value is None
    frame = build_table(long, target=TARGET).frame
    assert by_feature[FEATURES[1]].value == frame.loc[IMPUTED, FEATURES[1]]


def test_missing_ci_has_null_se_but_a_threshold(model: TargetModel) -> None:
    county = model.counties[NO_CI]
    assert county.se is None
    assert county.threshold_75 is not None
    assert county.flag != "insufficient_data"


def test_thresholds_and_importance_use_full_training_population(
    long: pd.DataFrame, model: TargetModel
) -> None:
    frame = build_table(long, target=TARGET).frame
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


def test_targets_in_config_order(full_model: ModelFile) -> None:
    assert list(full_model.targets) == list(TARGETS)


def test_target_carries_catalog_label_unit_direction(full_model: ModelFile) -> None:
    premature = full_model.targets["premature_death"]
    assert (premature.label, premature.unit, premature.direction) == (
        "Premature death (years lost)",
        "rate_per_100k",
        "higher_is_worse",
    )


@pytest.mark.parametrize("target_id", TARGETS)
def test_run_flags_follow_direction(full_model: ModelFile, target_id: str) -> None:
    target = full_model.targets[target_id]
    # Worse means a positive residual when higher is worse, a negative one when higher is better.
    worse_sign = 1 if target.direction == "higher_is_worse" else -1
    scored = [c for c in target.counties.values() if c.residual is not None]
    assert scored
    for c in scored:
        assert c.residual is not None and c.threshold_75 is not None
        assert c.threshold_90 is not None
        worse_by = worse_sign * c.residual
        if c.flag in ("notably_worse", "somewhat_worse"):
            assert worse_by > c.threshold_75
        elif c.flag in ("notably_better", "somewhat_better"):
            assert -worse_by > c.threshold_75
        if worse_by > c.threshold_90:
            assert c.flag == "notably_worse"
        elif -worse_by > c.threshold_90:
            assert c.flag == "notably_better"
    assert any(c.flag != "none" for c in scored)


def test_card_target_matches_key(full_model: ModelFile) -> None:
    assert all(t.model_card.target == k for k, t in full_model.targets.items())


def test_training_counts_differ_when_a_target_is_sparser(long: pd.DataFrame) -> None:
    state_counties = sorted(f for f in long["fips"].unique() if f.startswith("41"))
    sparse = state_counties[: len(state_counties) // 2]
    drop = (long["indicator_id"] == "injury_deaths") & long["fips"].isin(sparse)
    long = long.copy()
    long.loc[drop, ["value", "ci_low", "ci_high"]] = np.nan
    targets = run_model(long, CATALOG).targets
    expected = len(build_table(long, target="injury_deaths").frame)
    assert targets["injury_deaths"].model_card.training_counties == expected
    assert expected < len(build_table(long, target="premature_death").frame)
    assert targets["premature_death"].model_card.training_counties > expected


def test_target_without_cis_names_the_target(long: pd.DataFrame) -> None:
    long = long.copy()
    rows = long["indicator_id"] == "premature_death"
    long.loc[rows, ["ci_low", "ci_high"]] = np.nan
    with pytest.raises(ModelDataError, match="premature_death"):
        run_model(long, CATALOG)


INELIGIBLE = "53005"


def test_build_peers_covers_exactly_the_pnw() -> None:
    long = make_long(states=("53", "41", "16", "02"), per_state=10)
    long = pd.concat([long, make_long(states=("06",), per_state=1)], ignore_index=True)
    # Too few features to place, so this county gets no peers.
    sparse = long["indicator_id"].isin(FEATURES[: len(FEATURES) - PEER_MIN_FEATURES + 1])
    long.loc[sparse & (long["fips"] == INELIGIBLE), "value"] = np.nan
    pnw = {f for f in long["fips"].unique() if state_abbr(f) is not None}
    assert "06001" in set(long["fips"]) and "06001" not in pnw

    peers = build_peers(long)

    assert set(peers.counties) == pnw
    assert peers.method.features == list(FEATURES)
    assert peers.method.k == PEER_K
    assert peers.method.min_features == PEER_MIN_FEATURES
    assert all(len(found) in (0, PEER_K) for found in peers.counties.values())
    assert all(set(found) <= pnw for found in peers.counties.values())
    assert peers.counties[INELIGIBLE] == []
    assert all(INELIGIBLE not in found for found in peers.counties.values())
    assert sum(len(found) == PEER_K for found in peers.counties.values()) == len(pnw) - 1
