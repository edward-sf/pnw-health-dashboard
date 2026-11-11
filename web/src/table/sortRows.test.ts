import { expect, test } from "vitest";
import { compareNullable, sortRows, type Row } from "./sortRows";

const e = (v: number | null, rank: number | null = null) => ({
  v,
  lo: null,
  hi: null,
  rank,
  state_rank: rank,
});
const row = (fips: string, name: string, state: string, v: number | null | undefined, rank: number | null = null): Row => ({
  fips,
  name,
  state,
  entry: v === undefined ? undefined : e(v, rank),
});

const rows = [
  row("1", "Bravo", "WA", 5, 2),
  row("2", "Alpha", "OR", null),
  row("3", "Charlie", "ID", 0, 3),
  row("4", "Delta", "WA", undefined),
  row("5", "Able", "AK", 5, 1),
];
const names = (r: Row[]) => r.map((x) => x.name);

test("nulls and missing entries sort last in asc", () => {
  expect(names(sortRows(rows, "value", "asc"))).toEqual(["Charlie", "Able", "Bravo", "Alpha", "Delta"]);
});
test("nulls and missing entries sort last in desc", () => {
  expect(names(sortRows(rows, "value", "desc"))).toEqual(["Able", "Bravo", "Charlie", "Alpha", "Delta"]);
});
test("a true zero sorts as a number, not as missing", () => {
  expect(sortRows(rows, "value", "asc")[0]!.name).toBe("Charlie");
});
test("ties break by name in both directions", () => {
  expect(names(sortRows(rows, "value", "desc")).slice(0, 2)).toEqual(["Able", "Bravo"]);
  expect(names(sortRows(rows, "value", "asc")).slice(1, 3)).toEqual(["Able", "Bravo"]);
});
test("rank sorts with nulls last", () => {
  expect(names(sortRows(rows, "rank", "asc"))).toEqual(["Able", "Bravo", "Charlie", "Alpha", "Delta"]);
});
test("name and state sort as text", () => {
  expect(names(sortRows(rows, "name", "desc"))[0]).toBe("Delta");
  expect(sortRows(rows, "state", "asc")[0]!.state).toBe("AK");
});
test("does not mutate its input", () => {
  const copy = [...rows];
  sortRows(rows, "name", "asc");
  expect(rows).toEqual(copy);
});

test("compareNullable puts nulls last in both directions", () => {
  expect(compareNullable(null, 1, 1)).toBe(1);
  expect(compareNullable(null, 1, -1)).toBe(1);
  expect(compareNullable(1, null, -1)).toBe(-1);
  expect(compareNullable(null, null, 1)).toBe(0);
  expect(compareNullable(1, 2, -1)).toBeGreaterThan(0);
});
