import { expect, it } from "vitest";
import { breakdownScale } from "./breakdownScale";

it("pads the domain by 5% each side", () => {
  // Span 10, so the domain is 9.5 to 20.5 and spans 11.
  const x = breakdownScale([10, 15, 20]);
  expect(x(9.5)).toBeCloseTo(0);
  expect(x(20.5)).toBeCloseTo(100);
  expect(x(10)).toBeCloseTo((0.5 / 11) * 100);
  expect(x(15)).toBeCloseTo(50);
  expect(x(20)).toBeCloseTo((10.5 / 11) * 100);
});

it("maps a single value to 50", () => {
  expect(breakdownScale([7])(7)).toBe(50);
  expect(breakdownScale([7, 7, 7])(7)).toBe(50);
});
