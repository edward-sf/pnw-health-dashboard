"""Fixed modeling choices: feature lists, seeds and the interval z-scores."""

from __future__ import annotations

from typing import Any

TARGET = "life_expectancy"
FEATURES: tuple[str, ...] = (
    "median_household_income",
    "poverty_rate",
    "uninsured_rate",
    "bachelors_or_higher",
    "unemployment_rate",
    "age_65_plus",
    "percent_rural",
    "severe_housing_cost_burden",
    "broadband_households",
)
BEHAVIORS = ("current_smoking", "obesity", "physical_inactivity", "binge_drinking")
ALLOWED_CATEGORIES = frozenset({"Social & Economic", "Access"})

SEED = 42
N_FOLDS = 5
RIDGE_ALPHA = 1.0
Z_75 = 1.150
Z_90 = 1.645
TOP_N = 5

# Smaller trees chosen at the M4 checkpoint; see M4 spec §3 "Checkpoint outcome".
LGBM_PARAMS: dict[str, Any] = {
    "objective": "regression",
    "n_estimators": 200,
    "learning_rate": 0.03,
    "num_leaves": 8,
    "min_child_samples": 20,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "reg_lambda": 10.0,
    "random_state": SEED,
    "deterministic": True,
    "force_row_wise": True,
    "num_threads": 1,
    "verbosity": -1,
}
