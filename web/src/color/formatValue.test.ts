import { expect, test } from "vitest";
import { formatBound, formatCi, formatSigned, formatTick, formatValue } from "./formatValue";

test("formats by unit", () => {
  expect(formatValue(12.34, "percent")).toBe("12.3%");
  expect(formatValue(72400, "dollars")).toBe("$72,400");
  expect(formatValue(78.25, "years")).toBe("78.3 years");
  expect(formatValue(123.4, "rate_per_100k")).toBe("123.4 per 100k");
  expect(formatValue(1234, "count")).toBe("1,234");
  expect(formatValue(0, "percent")).toBe("0.0%");
});
test("null is described, not zero", () => {
  expect(formatValue(null, "percent")).toBe("Suppressed or not available");
});

test("formatBound drops suffixes but keeps dollars", () => {
  expect(formatBound(9.1, "percent")).toBe("9.1");
  expect(formatBound(72400, "dollars")).toBe("$72,400");
  expect(formatBound(78.25, "years")).toBe("78.3");
  expect(formatBound(123.4, "rate_per_100k")).toBe("123.4");
  expect(formatBound(1234, "count")).toBe("1,234");
});

test("formatTick is compact, with the unit only where it is short", () => {
  expect(formatTick(72400, "dollars")).toBe("$72.4K");
  expect(formatTick(12.34, "percent")).toBe("12.3%");
  expect(formatTick(0, "percent")).toBe("0%");
  expect(formatTick(78.25, "years")).toBe("78.3");
  expect(formatTick(15000, "rate_per_100k")).toBe("15K");
  expect(formatTick(1234, "count")).toBe("1.2K");
});

test("formatSigned uses + and the true minus, and drops the sign at zero", () => {
  expect(formatSigned(3.65, "years")).toBe("+3.7 years");
  expect(formatSigned(-2.6, "years")).toBe("\u22122.6 years");
  expect(formatSigned(-0.04, "years")).toBe("0.0 years");
  expect(formatSigned(2.58, "years", 2)).toBe("+2.58 years");
});

test("formatSigned uses the same unit suffix as formatValue", () => {
  expect(formatSigned(2.6, "percent")).toBe("+2.6%");
  expect(formatSigned(-1500, "dollars", 0)).toBe("−$1,500");
  expect(formatSigned(3.4, "rate_per_100k")).toBe("+3.4 per 100k");
});

test("formatSigned defaults to the unit's own digits", () => {
  expect(formatSigned(1500, "dollars")).toBe("+$1,500");
  expect(formatSigned(2.6, "percent")).toBe("+2.6%");
  expect(formatSigned(3.65, "years")).toBe("+3.7 years");
});

test("formatCi uses the indicator's level and bounds, or null without both bounds", () => {
  const ind = { unit: "years", ci_level: 0.95 } as const;
  expect(formatCi(73.84, 74.6, ind)).toBe("95% CI 73.8–74.6");
  expect(formatCi(9.1, 9.9, { unit: "percent", ci_level: 0.9 })).toBe("90% CI 9.1–9.9");
  expect(formatCi(null, 74.6, ind)).toBeNull();
  expect(formatCi(73.8, null, ind)).toBeNull();
  expect(formatCi(73.8, 74.6, { unit: "years", ci_level: null })).toBeNull();
});
