import { expect, test } from "vitest";
import { manifest } from "../test/fixtures";
import { parseParams } from "./parseParams";

const parse = (s: string) => parseParams(s, manifest, new Set(["53033", "02016"]));

test("defaults to the first catalog indicator", () => {
  expect(parse("")).toEqual({
    indicator: manifest.indicators[0]!.id,
    county: null,
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
test("unbuilt mode is invalid", () => {
  expect(parse("?mode=model").invalid).toEqual(["mode"]);
});
