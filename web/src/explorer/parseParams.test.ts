import { expect, test } from "vitest";
import { manifest } from "../test/fixtures";
import { parseParams } from "./parseParams";

const targetIds = ["life_expectancy", "premature_death", "injury_deaths"];
const parse = (s: string) =>
  parseParams(s, manifest, new Set(["53033", "02016"]), targetIds);

test("defaults to the first catalog indicator", () => {
  expect(parse("")).toEqual({
    indicator: manifest.indicators[0]!.id,
    county: null,
    target: "life_expectancy",
    mode: "values",
    view: "map",
    invalid: [],
  });
});
test("reads valid params", () => {
  expect(parse("?i=median_household_income&c=02016")).toMatchObject({
    indicator: "median_household_income",
    county: "02016",
    invalid: [],
  });
});
test("a bad param is flagged alone, the rest kept", () => {
  expect(parse("?i=bogus&c=53033")).toMatchObject({
    indicator: manifest.indicators[0]!.id,
    county: "53033",
    invalid: ["i"],
  });
});
test("an unpadded fips is invalid", () => {
  expect(parse("?c=2016")).toMatchObject({ county: null, invalid: ["c"] });
});
test("view=table is valid", () => {
  expect(parse("?view=table")).toMatchObject({ view: "table", invalid: [] });
});
test("view=bogus is invalid and defaults to map", () => {
  expect(parse("?view=bogus")).toMatchObject({ view: "map", invalid: ["view"] });
});
test("mode=model is accepted", () => {
  expect(parse("?mode=model")).toMatchObject({ mode: "model", invalid: [] });
});
test("mode=Model and an empty mode are invalid and default to values, keeping the rest", () => {
  for (const s of ["?i=pct_asian&c=53033&mode=Model", "?i=pct_asian&c=53033&mode="]) {
    expect(parse(s)).toMatchObject({
      mode: "values",
      indicator: "pct_asian",
      county: "53033",
      invalid: ["mode"],
    });
  }
});

test("defaults t to the first target", () => {
  expect(parse("")).toMatchObject({ target: "life_expectancy", invalid: [] });
});
test("accepts a known t", () => {
  expect(parse("?t=injury_deaths")).toMatchObject({ target: "injury_deaths", invalid: [] });
});
test("flags an unknown t", () => {
  expect(parse("?t=nope")).toMatchObject({ target: "life_expectancy", invalid: ["t"] });
});
