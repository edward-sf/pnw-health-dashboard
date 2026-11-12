"""Fixed modeling choices: targets, feature lists, seeds, interval z-scores and peer settings."""

from __future__ import annotations

from typing import Any

# This order is the outcome picker's order; the web defaults to life_expectancy when present.
TARGETS: tuple[str, ...] = (
    "life_expectancy",
    "premature_death",
    "injury_deaths",
)
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
PEER_K = 5
PEER_MIN_FEATURES = 6

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
