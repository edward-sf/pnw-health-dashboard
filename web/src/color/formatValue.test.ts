import { expect, test } from "vitest";
import { formatValue } from "./formatValue";

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
