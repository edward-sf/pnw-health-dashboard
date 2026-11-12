"""Run the whole model and assemble the contents of ``model.json``.

Models, flags and importance use every training county in the country; only the Pacific
Northwest counties are written out, each with the factors associated with its prediction.
"""

from __future__ import annotations

import math
from typing import cast

import lightgbm
import pandas as pd

from pnw_health.config import state_abbr
from pnw_health.contract import (
    CountyModel,
    ExcludedCounty,
    ExcludedFeatureGroup,
    ImportanceEntry,
    ModelCard,
    ModelFile,
    ModelMetricsBlock,
    PeerMethod,
    Peers,
    ShapEntry,
    TargetModel,
    Thresholds,
)
from pnw_health.indicators import Indicator
from pnw_health.model.compare import compare_behaviors
from pnw_health.model.config import (
    BEHAVIORS,
    FEATURES,
    LGBM_PARAMS,
    N_FOLDS,
    PEER_K,
    PEER_MIN_FEATURES,
    SEED,
    TARGETS,
    Z_75,
    Z_90,
)
from pnw_health.model.cv import assign_folds, fit_lightgbm_oof, fit_ridge_oof, score_regions
from pnw_health.model.explain import global_importance, ranked_contributions
from pnw_health.model.features import ModelDataError, build_table, check_features, check_targets
from pnw_health.model.flags import classify, se_from_ci, sigma_model_sq
from pnw_health.model.peers import find_peers
from pnw_health.numeric import nan_to_none

DROPPED_REASON = (
    "Target reported but no features available; for Connecticut, CHR reports former counties "
    "while ACS reports planning regions."
)
EXCLUDED_FEATURE_GROUPS = (
    ("Behaviors", "Health behaviors closely restate the outcome."),
    (
        "Demographics",
        "Race and ethnicity shares act as proxies for structural factors, "
        "so attributions would mislead.",
    ),
)
NO_DATA = CountyModel(
    actual=None,
    predicted=None,
    residual=None,
    se=None,
    threshold_75=None,
    threshold_90=None,
    base_value=None,
    flag="insufficient_data",
    shap=[],
)


def run_model(long: pd.DataFrame, catalog: list[Indicator]) -> ModelFile:
    """Fit, flag and explain every target from the national long table, at full precision."""
    check_features(FEATURES, catalog)
    check_targets(TARGETS, catalog)
    by_id = {ind.id: ind for ind in catalog}
    return ModelFile(
        targets={name: run_target(long, by_id[name]) for name in TARGETS},
        peers=build_peers(long),
    )


def build_peers(long: pd.DataFrame) -> Peers:
    """Nearest-neighbour peers among the PNW counties, on the model's features."""
    pnw = sorted({str(f) for f in long["fips"] if state_abbr(str(f)) is not None})
    rows = long[long["indicator_id"].isin(FEATURES) & long["fips"].isin(pnw)]
    table = rows.pivot(index="fips", columns="indicator_id", values="value")
    table = table.reindex(index=pnw, columns=list(FEATURES))
    return Peers(
        method=PeerMethod(features=list(FEATURES), k=PEER_K, min_features=PEER_MIN_FEATURES),
        counties=find_peers(table, PEER_K, PEER_MIN_FEATURES),
    )


def run_target(long: pd.DataFrame, target: Indicator) -> TargetModel:
    """Fit, flag and explain one target. A data problem names the target."""
    if target.direction == "neutral":
        raise ModelDataError(f"{target.id}: direction 'neutral' cannot be flagged")
    try:
        table = build_table(long, target=target.id)
        frame = table.frame
        folds = assign_folds(frame["state"])
        ridge = fit_ridge_oof(frame, FEATURES, folds)
        lgbm = fit_lightgbm_oof(frame, FEATURES, folds)

        residuals = frame["target"] - lgbm.predicted
        se = se_from_ci(frame["ci_low"], frame["ci_high"])
        sigma_sq = sigma_model_sq(residuals, se)
        flags = classify(residuals, se, sigma_sq, float((se**2).mean()), target.direction)
        behaviors_comparison = compare_behaviors(frame, FEATURES, BEHAVIORS, folds)
    except ModelDataError as err:
        raise ModelDataError(f"{target.id}: {err}") from err
    feature_values = frame[list(FEATURES)]

    counties: dict[str, CountyModel] = {}
    for fips in sorted({str(f) for f in long["fips"] if state_abbr(str(f)) is not None}):
        if fips not in frame.index:
            counties[fips] = NO_DATA
            continue
        contributions = ranked_contributions(
            cast(pd.Series, lgbm.contributions.loc[fips]),
            cast(pd.Series, feature_values.loc[fips]),
        )
        counties[fips] = CountyModel(
            actual=nan_to_none(frame["target"][fips]),
            predicted=nan_to_none(lgbm.predicted[fips]),
            residual=nan_to_none(residuals[fips]),
            se=nan_to_none(se[fips]),
            threshold_75=nan_to_none(flags.threshold_75[fips]),
            threshold_90=nan_to_none(flags.threshold_90[fips]),
            base_value=nan_to_none(lgbm.base_value[fips]),
            flag=flags.flag[fips],
            shap=[
                ShapEntry(feature=c.feature, value=c.value, contribution=c.contribution)
                for c in contributions
            ],
        )

    return TargetModel(
        label=target.label,
        unit=target.unit,
        direction=target.direction,
        metrics=ModelMetricsBlock(
            ridge=score_regions(frame, ridge),
            lightgbm=score_regions(frame, lgbm.predicted),
        ),
        behaviors_comparison=behaviors_comparison,
        global_importance=[
            ImportanceEntry(feature=feature, mean_abs_shap=value)
            for feature, value in global_importance(lgbm.contributions)
        ],
        thresholds=Thresholds(sigma_model=math.sqrt(sigma_sq), z_75=Z_75, z_90=Z_90),
        counties=counties,
        model_card=ModelCard(
            target=target.id,
            training_counties=len(frame),
            features=list(FEATURES),
            excluded_counties=[
                ExcludedCounty(fips=fips, reason=DROPPED_REASON) for fips in table.dropped
            ],
            excluded_feature_groups=[
                ExcludedFeatureGroup(category=category, reason=reason)
                for category, reason in EXCLUDED_FEATURE_GROUPS
            ],
            n_folds=N_FOLDS,
            seed=SEED,
            lightgbm_params=LGBM_PARAMS,
            lightgbm_version=lightgbm.__version__,
        ),
    )
