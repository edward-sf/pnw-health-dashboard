import { expect, test } from "vitest";
import { HATCH_BACKGROUND, HATCH_FILL } from "../color/makeColorScale";
import { lifeExpectancy as model, prematureDeath } from "../test/fixtures";
import {
  countyModel,
  hasModelResult,
  modelTooltip,
  TIERS,
  tierCounts,
  tierFill,
  tierLabel,
  tierRank,
} from "./modelView";

test("TIERS run worst to best and exclude insufficient_data", () => {
  expect(TIERS).toEqual([
    "notably_worse",
    "somewhat_worse",
    "none",
    "somewhat_better",
    "notably_better",
  ]);
});

test("tierRank", () => {
  expect(tierRank("notably_worse")).toBe(0);
  expect(tierRank("notably_better")).toBe(4);
  expect(tierRank("insufficient_data")).toBeNull();
});

test("labels", () => {
  expect(tierLabel("notably_worse")).toBe("Notably worse than expected");
  expect(tierLabel("none")).toBe("About as expected");
  expect(tierLabel("insufficient_data")).toBe("Not enough data");
});

test("fills are distinct, differ from the hatch base, and insufficient_data is the hatch", () => {
  const fills = TIERS.map(tierFill);
  expect(new Set(fills).size).toBe(5);
  for (const f of fills) expect(f).not.toBe(HATCH_BACKGROUND);
  expect(tierFill("notably_better")).toBe("#0571b0");
  expect(tierFill("insufficient_data")).toBe(HATCH_FILL);
});

test("countyModel falls back to insufficient_data for a missing FIPS", () => {
  const e = countyModel(model, "99999");
  expect(e.flag).toBe("insufficient_data");
  expect(e.shap).toEqual([]);
  expect(e.actual).toBeNull();
  expect(countyModel(model, "53033").flag).toBe("notably_better");
});

test("tierCounts", () => {
  expect(tierCounts(model, ["53033", "41051", "16001", "02016", "02063"])).toEqual({
    notably_worse: 0,
    somewhat_worse: 1,
    none: 1,
    somewhat_better: 1,
    notably_better: 1,
    insufficient_data: 1,
  });
});

test("modelTooltip", () => {
  expect(modelTooltip("King", "WA", countyModel(model, "53033"), "years")).toBe(
    "King, WA: notably better than expected (+3.7 years)",
  );
  expect(modelTooltip("Chugach", "AK", countyModel(model, "02063"), "years")).toBe(
    "Chugach, AK: not enough data for the model",
  );
});

test("modelTooltip formats the difference in the target's unit", () => {
  expect(
    modelTooltip("Aleutians West", "AK", countyModel(prematureDeath, "02016"), "rate_per_100k"),
  ).toBe("Aleutians West, AK: notably worse than expected (+1,800 per 100k)");
});

test("hasModelResult is false for insufficient data or any null field", () => {
  const full = model.counties["53033"]!;
  expect(hasModelResult(full)).toBe(true);
  expect(hasModelResult({ ...full, flag: "insufficient_data" })).toBe(false);
  for (const k of ["actual", "predicted", "residual", "base_value", "threshold_75", "threshold_90"] as const) {
    expect(hasModelResult({ ...full, [k]: null })).toBe(false);
  }
});
