import { expect, test } from "vitest";
import type { ValueEntry } from "../types";
import { rankSummary } from "./rankSummary";
import type { County } from "../types";

const e = (rank: number | null, state_rank: number | null): ValueEntry => ({
  v: rank === null ? null : 1,
  lo: null,
  hi: null,
  rank,
  state_rank,
});

function build(n: number, rank: number, stateRank: number) {
  const counties: County[] = [];
  const entries: Record<string, ValueEntry> = {};
  for (let i = 0; i < n; i++) {
    const fips = String(i).padStart(5, "0");
    counties.push({ fips, name: `C${i}`, state: i < 3 ? "WA" : "OR" });
    entries[fips] = e(i === 0 ? rank : i + 1, i === 0 ? stateRank : i + 1);
  }
  return { counties, entries };
}

test("formats overall and state rank with spelled-out state", () => {
  const { counties, entries } = build(6, 12, 3);
  expect(rankSummary("00000", entries, counties)).toBe(
    "12th of 6 counties, 3rd of 3 in Washington (1 = best)",
  );
});

test("denominators exclude nulls", () => {
  const { counties, entries } = build(6, 1, 1);
  entries["00001"] = e(null, null);
  entries["00004"] = e(null, null);
  expect(rankSummary("00000", entries, counties)).toBe(
    "1st of 4 counties, 1st of 2 in Washington (1 = best)",
  );
});

test("ordinals", () => {
  const ord = (n: number) => {
    const { counties, entries } = build(2, n, 1);
    return rankSummary("00000", entries, counties)!.split(" ")[0];
  };
  expect([1, 2, 3, 11, 12, 13, 21].map(ord)).toEqual([
    "1st",
    "2nd",
    "3rd",
    "11th",
    "12th",
    "13th",
    "21st",
  ]);
});

test("null rank returns null", () => {
  const { counties, entries } = build(3, 1, 1);
  entries["00000"] = e(null, null);
  expect(rankSummary("00000", entries, counties)).toBeNull();
});

test("spells out all states", () => {
  const counties: County[] = [
    { fips: "1", name: "a", state: "OR" },
    { fips: "2", name: "b", state: "ID" },
    { fips: "3", name: "c", state: "AK" },
  ];
  const entries = { "1": e(1, 1), "2": e(2, 1), "3": e(3, 1) };
  expect(rankSummary("1", entries, counties)).toContain("in Oregon");
  expect(rankSummary("2", entries, counties)).toContain("in Idaho");
  expect(rankSummary("3", entries, counties)).toContain("in Alaska");
});
