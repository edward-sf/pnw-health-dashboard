import { expect, test } from "vitest";
import { matchCounties } from "./matchCounties";

const counties = [
  { fips: "53033", name: "King County", state: "WA" },
  { fips: "41051", name: "Multnomah County", state: "OR" },
  { fips: "41067", name: "Washington County", state: "OR" },
  { fips: "16087", name: "Washington County", state: "ID" },
  { fips: "02016", name: "Aleutians West Census Area", state: "AK" },
];
const names = (text: string, max?: number) =>
  matchCounties(counties, text, max).map((c) => `${c.name}, ${c.state}`);

test("matches by name, case-insensitively", () => {
  expect(names("kING")).toEqual(["King County, WA"]);
});

test("matches by state abbreviation", () => {
  expect(names(", id")).toEqual(["Washington County, ID"]);
});

test("matches by full state name", () => {
  expect(names("oregon")).toEqual(["Multnomah County, OR", "Washington County, OR"]);
});

test("matches a county and full state name together", () => {
  expect(names("king county, wash")).toEqual(["King County, WA"]);
});

test("empty or blank text matches nothing", () => {
  expect(names("")).toEqual([]);
  expect(names("   ")).toEqual([]);
});

test("caps the result at max (8 by default)", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ fips: `0${1000 + i}`, name: `X${i} County`, state: "WA" }));
  expect(matchCounties(many, "x")).toHaveLength(8);
  expect(matchCounties(many, "x", 3)).toHaveLength(3);
});

test("counties named for a state rank above counties in that state", () => {
  const many = [
    ...Array.from({ length: 10 }, (_, i) => ({ fips: `5300${i}`, name: `X${i} County`, state: "WA" })),
    { fips: "41067", name: "Washington County", state: "OR" },
  ];
  const found = matchCounties(many, "washington");
  expect(found[0]).toMatchObject({ fips: "41067" });
  expect(found).toHaveLength(8);
});
