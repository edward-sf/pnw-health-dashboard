import { expect, test } from "vitest";
import { STATE_FIPS_NAMES, stateNameForFips } from "./stateFipsNames";

test("covers 50 states, DC and Puerto Rico", () => {
  expect(Object.keys(STATE_FIPS_NAMES)).toHaveLength(52);
  expect(STATE_FIPS_NAMES["11"]).toBe("District of Columbia");
  expect(STATE_FIPS_NAMES["72"]).toBe("Puerto Rico");
});

test("stateNameForFips takes a state or county FIPS", () => {
  expect(stateNameForFips("21")).toBe("Kentucky");
  expect(stateNameForFips("09001")).toBe("Connecticut");
});

test("an unknown FIPS is shown as its state prefix", () => {
  expect(stateNameForFips("99")).toBe("99");
  expect(stateNameForFips("99001")).toBe("99");
});
