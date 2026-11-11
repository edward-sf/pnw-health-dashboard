import type { CountyModel, ModelFile } from "../../types";

const insufficient: CountyModel = {
  actual: null,
  predicted: null,
  residual: null,
  se: null,
  threshold_75: null,
  threshold_90: null,
  base_value: null,
  flag: "insufficient_data",
  shap: [],
};

export const model: ModelFile = {
  metrics: {
    lightgbm: {
      national: { mae: 1.1, n: 3000, r2: 0.8, rmse: 1.5 },
      pnw: { mae: 1.2, n: 139, r2: 0.7, rmse: 1.6 },
    },
    ridge: {
      national: { mae: 1.3, n: 3000, r2: 0.75, rmse: 1.7 },
      pnw: { mae: 1.4, n: 139, r2: 0.65, rmse: 1.8 },
    },
  },
  behaviors_comparison: {
    behaviors: {
      national: { mae: 1.0, n: 3000, r2: 0.85, rmse: 1.4 },
      pnw: { mae: 1.1, n: 139, r2: 0.75, rmse: 1.5 },
    },
    main: {
      national: { mae: 1.1, n: 3000, r2: 0.8, rmse: 1.5 },
      pnw: { mae: 1.2, n: 139, r2: 0.7, rmse: 1.6 },
    },
    excluded_states: [
      {
        state_fips: "21",
        counties: 120,
        reason: "PLACES does not report these behavior measures for this state's counties.",
      },
    ],
  },
  global_importance: [
    { feature: "bachelors_or_higher", mean_abs_shap: 1.2 },
    { feature: "median_household_income", mean_abs_shap: 0.5 },
    { feature: "unemployment_rate", mean_abs_shap: 0.1 },
    { feature: "poverty_rate", mean_abs_shap: 0.9 },
  ],
  thresholds: { sigma_model: 1.2, z_75: 1.15, z_90: 1.64 },
  counties: {
    "53033": {
      actual: 80.8,
      predicted: 77.1,
      residual: 3.7,
      se: 0.47,
      threshold_75: 2.36,
      threshold_90: 3.37,
      base_value: 75.0,
      flag: "notably_better",
      shap: [
        { feature: "bachelors_or_higher", value: 43.0, contribution: 2.58 },
        { feature: "poverty_rate", value: 9.5, contribution: -0.68 },
        { feature: "median_household_income", value: 120000, contribution: -0.4 },
      ],
    },
    "41051": {
      actual: 76.0,
      predicted: 78.6,
      residual: -2.6,
      se: 0.4,
      threshold_75: 2.4,
      threshold_90: 3.4,
      base_value: 75.0,
      flag: "somewhat_worse",
      shap: [{ feature: "poverty_rate", value: 12.0, contribution: 1.2 }],
    },
    "16001": {
      actual: 79.0,
      predicted: 78.5,
      residual: 0.5,
      se: null,
      threshold_75: 2.4,
      threshold_90: 3.4,
      base_value: 75.0,
      flag: "none",
      shap: [{ feature: "median_household_income", value: null, contribution: 1.1 }],
    },
    "02016": {
      actual: 79.5,
      predicted: 77.0,
      residual: 2.5,
      se: 0.5,
      threshold_75: 2.4,
      threshold_90: 3.4,
      base_value: 75.0,
      flag: "somewhat_better",
      shap: [{ feature: "poverty_rate", value: 14.2, contribution: -0.5 }],
    },
    "02063": insufficient,
  },
  model_card: {
    excluded_counties: [
      { fips: "09001", reason: "Connecticut reports planning regions, not counties." },
      { fips: "09003", reason: "Connecticut reports planning regions, not counties." },
      { fips: "15005", reason: "No features available." },
    ],
    excluded_feature_groups: [
      { category: "Behaviors", reason: "Health behaviors closely restate the outcome." },
      { category: "Demographics", reason: "Race and ethnicity shares act as proxies." },
    ],
    features: ["bachelors_or_higher", "poverty_rate", "median_household_income"],
    lightgbm_params: { learning_rate: 0.03, deterministic: true },
    lightgbm_version: "4.0.0",
    n_folds: 5,
    seed: 1,
    target: "life_expectancy",
    training_counties: 3000,
  },
};
