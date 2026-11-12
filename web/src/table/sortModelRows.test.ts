import { expect, test } from "vitest";
import { lifeExpectancy as model, prematureDeath } from "../test/fixtures";
import { countyModel } from "../model/modelView";
import { sortModelRows, type ModelRow } from "./sortModelRows";

const counties = [
  { fips: "53033", name: "King", state: "WA" },
  { fips: "41051", name: "Multnomah", state: "OR" },
  { fips: "16001", name: "Ada", state: "ID" },
  { fips: "02016", name: "Aleutians West", state: "AK" },
  { fips: "02063", name: "Chugach", state: "AK" },
];
const rows: ModelRow[] = counties.map((c) => ({
  ...c,
  model: countyModel(model, c.fips),
}));
const names = (r: ModelRow[]) => r.map((x) => x.name);

test("result ascending puts the worst first and not-enough-data last", () => {
  const out = names(sortModelRows(rows, "result", "asc", "higher_is_better"));
  expect(out[0]).toBe("Multnomah");
  expect(out.at(-1)).toBe("Chugach");
});

test("result descending puts the best first and not-enough-data still last", () => {
  const out = names(sortModelRows(rows, "result", "desc", "higher_is_better"));
  expect(out[0]).toBe("King");
  expect(out.at(-1)).toBe("Chugach");
});

test("difference descending puts missing values last", () => {
  const out = names(sortModelRows(rows, "difference", "desc", "higher_is_better"));
  expect(out[0]).toBe("King");
  expect(out.at(-1)).toBe("Chugach");
});

test("expected sorts by the predicted value", () => {
  expect(names(sortModelRows(rows, "expected", "desc", "higher_is_better"))[0]).toBe("Multnomah");
});

test("ties break by name in either direction", () => {
  const king = rows[0]!;
  const tied: ModelRow[] = [
    { ...king, fips: "99002", name: "Zed" },
    { ...king, fips: "99001", name: "Abe" },
  ];
  expect(names(sortModelRows(tied, "actual", "asc", "higher_is_better"))).toEqual(["Abe", "Zed"]);
  expect(names(sortModelRows(tied, "result", "desc", "higher_is_better"))).toEqual(["Abe", "Zed"]);
});

test("rows with no value are ordered by name, last in either direction", () => {
  const chugach = rows.find((r) => r.fips === "02063")!;
  const withTwoNulls: ModelRow[] = [...rows, { ...chugach, fips: "02050", name: "Bethel" }];
  expect(names(sortModelRows(withTwoNulls, "actual", "asc", "higher_is_better"))).toEqual([
    "Multnomah", "Ada", "Aleutians West", "King", "Bethel", "Chugach",
  ]);
  expect(names(sortModelRows(withTwoNulls, "actual", "desc", "higher_is_better")).slice(-2)).toEqual([
    "Bethel", "Chugach",
  ]);
});

test("does not mutate its input", () => {
  const copy = [...rows];
  sortModelRows(rows, "name", "desc", "higher_is_better");
  expect(rows).toEqual(copy);
});

test("higher_is_worse: result orders worst first within a tier", () => {
  const base = countyModel(prematureDeath, "02016");
  const tied: ModelRow[] = [
    { fips: "99001", name: "Abe", state: "WA", model: { ...base, residual: 1300 } },
    { fips: "99002", name: "Zed", state: "WA", model: { ...base, residual: 1900 } },
    { fips: "99003", name: "Mid", state: "WA", model: { ...base, flag: "none", residual: 100 } },
  ];
  expect(names(sortModelRows(tied, "result", "asc", "higher_is_worse"))).toEqual([
    "Zed", "Abe", "Mid",
  ]);
  expect(names(sortModelRows(tied, "result", "desc", "higher_is_worse"))).toEqual([
    "Mid", "Abe", "Zed",
  ]);
  // Difference stays a plain signed sort.
  expect(names(sortModelRows(tied, "difference", "asc", "higher_is_worse"))).toEqual([
    "Mid", "Abe", "Zed",
  ]);
});

test("higher_is_better: result orders the most negative first within a tier", () => {
  const base = countyModel(model, "41051");
  const tied: ModelRow[] = [
    { fips: "99001", name: "Abe", state: "WA", model: { ...base, flag: "notably_worse", residual: -2 } },
    { fips: "99002", name: "Zed", state: "WA", model: { ...base, flag: "notably_worse", residual: -3 } },
  ];
  expect(names(sortModelRows(tied, "result", "asc", "higher_is_better"))).toEqual(["Zed", "Abe"]);
});
