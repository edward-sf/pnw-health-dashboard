import { expect, test } from "vitest";
import { model } from "../test/fixtures";
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
  const out = names(sortModelRows(rows, "result", "asc"));
  expect(out[0]).toBe("Multnomah");
  expect(out.at(-1)).toBe("Chugach");
});

test("result descending puts the best first and not-enough-data still last", () => {
  const out = names(sortModelRows(rows, "result", "desc"));
  expect(out[0]).toBe("King");
  expect(out.at(-1)).toBe("Chugach");
});

test("difference descending puts missing values last", () => {
  const out = names(sortModelRows(rows, "difference", "desc"));
  expect(out[0]).toBe("King");
  expect(out.at(-1)).toBe("Chugach");
});

test("expected sorts by the predicted value", () => {
  expect(names(sortModelRows(rows, "expected", "desc"))[0]).toBe("Multnomah");
});

test("ties break by name in either direction", () => {
  const king = rows[0]!;
  const tied: ModelRow[] = [
    { ...king, fips: "99002", name: "Zed" },
    { ...king, fips: "99001", name: "Abe" },
  ];
  expect(names(sortModelRows(tied, "actual", "asc"))).toEqual(["Abe", "Zed"]);
  expect(names(sortModelRows(tied, "result", "desc"))).toEqual(["Abe", "Zed"]);
});

test("rows with no value are ordered by name, last in either direction", () => {
  const chugach = rows.find((r) => r.fips === "02063")!;
  const withTwoNulls: ModelRow[] = [...rows, { ...chugach, fips: "02050", name: "Bethel" }];
  expect(names(sortModelRows(withTwoNulls, "actual", "asc"))).toEqual([
    "Multnomah", "Ada", "Aleutians West", "King", "Bethel", "Chugach",
  ]);
  expect(names(sortModelRows(withTwoNulls, "actual", "desc")).slice(-2)).toEqual([
    "Bethel", "Chugach",
  ]);
});

test("does not mutate its input", () => {
  const copy = [...rows];
  sortModelRows(rows, "name", "desc");
  expect(rows).toEqual(copy);
});
