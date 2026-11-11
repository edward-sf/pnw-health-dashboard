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
    ShapEntry,
    Thresholds,
)
from pnw_health.indicators import Indicator
from pnw_health.model.compare import compare_behaviors
from pnw_health.model.config import (
    BEHAVIORS,
    FEATURES,
    LGBM_PARAMS,
    N_FOLDS,
    SEED,
    TARGET,
    Z_75,
    Z_90,
)
from pnw_health.model.cv import assign_folds, fit_lightgbm_oof, fit_ridge_oof, score_regions
from pnw_health.model.explain import global_importance, ranked_contributions
from pnw_health.model.features import build_table, check_features
from pnw_health.model.flags import classify, se_from_ci, sigma_model_sq

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


def _num(x: float) -> float | None:
    return None if math.isnan(x) else float(x)


def run_model(long: pd.DataFrame, catalog: list[Indicator]) -> ModelFile:
    """Fit, flag and explain from the national long table, at full precision."""
    check_features(FEATURES, catalog)
    table = build_table(long)
    frame = table.frame
    folds = assign_folds(frame["state"])
    ridge = fit_ridge_oof(frame, FEATURES, folds)
    lgbm = fit_lightgbm_oof(frame, FEATURES, folds)

    residuals = frame["target"] - lgbm.predicted
    se = se_from_ci(frame["ci_low"], frame["ci_high"])
    sigma_sq = sigma_model_sq(residuals, se)
    flags = classify(residuals, se, sigma_sq, float((se**2).mean()))
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
            actual=_num(frame["target"][fips]),
            predicted=_num(lgbm.predicted[fips]),
            residual=_num(residuals[fips]),
            se=_num(se[fips]),
            threshold_75=_num(flags.threshold_75[fips]),
            threshold_90=_num(flags.threshold_90[fips]),
            base_value=_num(lgbm.base_value[fips]),
            flag=flags.flag[fips],
            shap=[
                ShapEntry(feature=c.feature, value=c.value, contribution=c.contribution)
                for c in contributions
            ],
        )

    return ModelFile(
        metrics=ModelMetricsBlock(
            ridge=score_regions(frame, ridge),
            lightgbm=score_regions(frame, lgbm.predicted),
        ),
        behaviors_comparison=compare_behaviors(frame, FEATURES, BEHAVIORS, folds),
        global_importance=[
            ImportanceEntry(feature=feature, mean_abs_shap=value)
            for feature, value in global_importance(lgbm.contributions)
        ],
        thresholds=Thresholds(sigma_model=math.sqrt(sigma_sq), z_75=Z_75, z_90=Z_90),
        counties=counties,
        model_card=ModelCard(
            target=TARGET,
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
