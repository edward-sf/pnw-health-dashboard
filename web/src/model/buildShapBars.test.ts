import { expect, test } from "vitest";
import { manifest, lifeExpectancy as model, prematureDeath } from "../test/fixtures";
import type { CountyModel } from "../types";
import { buildShapBars } from "./buildShapBars";

const indicators = manifest.indicators;

test("King: three factors plus All other factors, reconciling to predicted", () => {
  const entry = model.counties["53033"]!;
  const bars = buildShapBars(entry, indicators, "years");
  expect(bars).toHaveLength(4);
  const other = bars[3]!;
  expect(other.other).toBe(true);
  expect(other.label).toBe("All other factors");
  expect(other.contribution).toBeCloseTo(0.6, 9);
  expect(other.contributionText).toBe("+0.60 years");
  const sum = bars.reduce((s, b) => s + b.contribution, 0);
  expect(sum).toBeCloseTo(entry.predicted! - entry.base_value!, 9);
  expect(bars[0]).toMatchObject({
    key: "bachelors_or_higher",
    label: "Bachelor's degree or higher: 43.0%",
    contributionText: "+2.58 years",
    other: false,
  });
  expect(bars[1]!.contributionText).toBe("−0.68 years");
});

test("a null value reads as imputed", () => {
  const bars = buildShapBars(model.counties["16001"]!, indicators, "years");
  expect(bars[0]!.label).toBe("Median household income: value not reported; estimated");
});

test("an unknown feature falls back to its id and the raw value", () => {
  const entry: CountyModel = {
    ...model.counties["53033"]!,
    shap: [{ feature: "foo", value: 12.3, contribution: 1 }],
  };
  expect(buildShapBars(entry, indicators, "years")[0]!.label).toBe("foo: 12.3");
});

test("no result gives no bars", () => {
  expect(buildShapBars(model.counties["02063"]!, indicators, "years")).toEqual([]);
});

test("displayed numbers reconcile exactly at 2 decimals (02130-like values)", () => {
  const entry: CountyModel = {
    ...model.counties["53033"]!,
    base_value: 75.1902,
    predicted: 77.5448,
    shap: [
      { feature: "bachelors_or_higher", value: 43.0, contribution: 2.5849 },
      { feature: "poverty_rate", value: 9.5, contribution: -0.6851 },
      { feature: "foo", value: 1, contribution: 0.0049 },
    ],
  };
  const bars = buildShapBars(entry, indicators, "years");
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const total = round2(entry.base_value!) + bars.reduce((t, b) => t + b.contribution, 0);
  expect(total).toBeCloseTo(round2(entry.predicted!), 9);
  expect(bars[3]!.contribution).toBeCloseTo(0.46, 9);
});

test("contributions are formatted in the target's unit", () => {
  const bars = buildShapBars(prematureDeath.counties["53033"]!, indicators, "rate_per_100k");
  expect(bars[0]!.contributionText).toBe("−300.00 per 100k");
  expect(bars.at(-1)!.contributionText).toBe("+200.00 per 100k");
  expect(bars.some((b) => b.contributionText.includes("years"))).toBe(false);
});
