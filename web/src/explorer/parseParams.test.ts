import { expect, test } from "vitest";
import { manifest as fixtureManifest } from "../test/fixtures";
import { parseParams } from "./parseParams";

const targetIds = ["life_expectancy", "premature_death", "injury_deaths"];
// The fixture manifest only carries life expectancy; add the other two targets as indicators.
const lifeExpectancy = fixtureManifest.indicators.find((x) => x.id === "life_expectancy")!;
const manifest = {
  ...fixtureManifest,
  indicators: [
    ...fixtureManifest.indicators,
    { ...lifeExpectancy, id: "premature_death", label: "Premature death" },
    { ...lifeExpectancy, id: "injury_deaths", label: "Injury deaths" },
  ],
};
const fips = new Set(["53033", "02016"]);
const parse = (s: string) => parseParams(s, manifest, fips, targetIds);

test("defaults to the first catalog indicator", () => {
  expect(parse("")).toEqual({
    indicator: manifest.indicators[0]!.id,
    county: null,
    target: "life_expectancy",
    show: "observed",
    view: "map",
    canonical: null,
  });
});
test("reads valid params", () => {
  expect(parse("?i=median_household_income&c=02016")).toMatchObject({
    indicator: "median_household_income",
    county: "02016",
    canonical: null,
  });
});
test("a bad param is flagged alone, the rest kept", () => {
  expect(parse("?i=bogus&c=53033")).toMatchObject({
    indicator: manifest.indicators[0]!.id,
    county: "53033",
    canonical: "c=53033",
  });
});
test("an unpadded fips is invalid", () => {
  expect(parse("?c=2016")).toMatchObject({ county: null, canonical: "" });
});
test("view=table is valid", () => {
  expect(parse("?view=table")).toMatchObject({ view: "table", canonical: null });
});
test("view=bogus is invalid and defaults to map", () => {
  expect(parse("?view=bogus")).toMatchObject({ view: "map", canonical: "" });
});
test("show=expected is kept on a model target", () => {
  const p = parse("i=premature_death&show=expected");
  expect(p).toMatchObject({
    indicator: "premature_death",
    target: "premature_death",
    show: "expected",
    canonical: null,
  });
});
test("show=expected on a measure with no model is dropped", () => {
  expect(parse("i=poverty_rate&show=expected")).toMatchObject({
    show: "observed",
    canonical: "i=poverty_rate",
  });
});
test("show=observed and an empty show are invalid", () => {
  expect(parse("i=poverty_rate&show=observed").canonical).toBe("i=poverty_rate");
  expect(parse("i=poverty_rate&show=").canonical).toBe("i=poverty_rate");
});
test("a model target drops t", () => {
  expect(parse("i=life_expectancy&t=injury_deaths")).toMatchObject({
    target: "life_expectancy",
    canonical: "i=life_expectancy",
  });
});
test("t picks the panel's outcome on other measures", () => {
  expect(parse("i=poverty_rate&t=injury_deaths")).toMatchObject({
    target: "injury_deaths",
    canonical: null,
  });
});
test("legacy mode=model becomes the target in Compared with expected, keeping c and view", () => {
  expect(parse("mode=model&t=injury_deaths&c=53033&view=table").canonical).toBe(
    "c=53033&view=table&i=injury_deaths&show=expected",
  );
});
test("legacy mode=model with no t uses the default target", () => {
  expect(parse("i=poverty_rate&mode=model")).toMatchObject({
    indicator: "life_expectancy",
    show: "expected",
  });
});
test("mode=values is dropped and nothing else changes", () => {
  expect(parse("i=poverty_rate&mode=values").canonical).toBe("i=poverty_rate");
});
test("an unknown mode is dropped, keeping the rest", () => {
  expect(parse("i=pct_asian&c=53033&mode=Model")).toMatchObject({
    show: "observed",
    indicator: "pct_asian",
    county: "53033",
    canonical: "i=pct_asian&c=53033",
  });
});

test("defaults t to the first target", () => {
  expect(parse("")).toMatchObject({ target: "life_expectancy", canonical: null });
});
test("accepts a known t", () => {
  expect(parse("?t=injury_deaths")).toMatchObject({ target: "injury_deaths", canonical: null });
});
test("flags an unknown t", () => {
  expect(parse("?t=nope")).toMatchObject({ target: "life_expectancy", canonical: "" });
});

test("the default target is life expectancy however the keys are ordered", () => {
  const shuffled = ["premature_death", "life_expectancy", "injury_deaths"];
  expect(parseParams("", manifest, new Set(), shuffled).target).toBe("life_expectancy");
});
test("falls back to the first target when life expectancy is absent", () => {
  expect(parseParams("", manifest, new Set(), ["premature_death"]).target).toBe("premature_death");
});
