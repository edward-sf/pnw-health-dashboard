import { expect, test } from "vitest";
import { manifest } from "../../test/fixtures";
import { featureLabel, formatCount, formatMetric } from "./format";

test("formatMetric rounds to 2 decimals", () => {
  expect(formatMetric(0.41224)).toBe("0.41");
  expect(formatMetric(2)).toBe("2.00");
});

test("formatCount adds thousands separators", () => {
  expect(formatCount(3060)).toBe("3,060");
});

test("featureLabel uses the manifest label, else the raw id", () => {
  expect(featureLabel("poverty_rate", manifest.indicators)).toBe("Poverty rate");
  expect(featureLabel("not_a_feature", manifest.indicators)).toBe("not_a_feature");
});
