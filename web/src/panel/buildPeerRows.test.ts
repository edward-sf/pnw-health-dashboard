import { describe, expect, test } from "vitest";
import { lifeExpectancy, model } from "../test/fixtures/model";
import type { County, ValueEntry } from "../types";
import { buildPeerRows } from "./buildPeerRows";

const counties: County[] = [
  { fips: "02016", name: "Aleutians West", state: "AK" },
  { fips: "02063", name: "Chugach", state: "AK" },
  { fips: "16001", name: "Ada", state: "ID" },
  { fips: "41051", name: "Multnomah", state: "OR" },
  { fips: "53033", name: "King", state: "WA" },
];
const entry = (v: number | null): ValueEntry => ({ v }) as ValueEntry;
const values = (v: Record<string, number | null>) => ({
  kind: "values" as const,
  entries: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, entry(x)])),
});

describe("buildPeerRows", () => {
  test("puts the selected county first, then peers nearest first", () => {
    const r = buildPeerRows(
      "02016",
      model.peers,
      counties,
      values({ "02016": 1, "02063": 2, "16001": 3 }),
    );
    expect(r!.rows.map((x) => x.fips)).toEqual(["02016", "02063", "16001"]);
    expect(r!.rows.map((x) => x.isSelected)).toEqual([true, false, false]);
    expect(r!.rows[1]).toMatchObject({ name: "Chugach", value: 2 });
  });

  test("median ignores null peers", () => {
    const r = buildPeerRows(
      "02016",
      model.peers,
      counties,
      values({ "02016": 100, "02063": null, "16001": 3 }),
    );
    expect(r!.median.value).toBe(3);
  });

  test("median is null when every peer is null", () => {
    const r = buildPeerRows(
      "02016",
      model.peers,
      counties,
      values({ "02016": 5 }),
    );
    expect(r!.median.value).toBeNull();
  });

  test("model source carries expected and flag", () => {
    const r = buildPeerRows("53033", model.peers, counties, {
      kind: "model",
      target: lifeExpectancy,
    });
    expect(r!.rows[0]).toMatchObject({
      fips: "53033",
      value: 80.8,
      expected: 77.1,
      flag: "notably_better",
    });
    expect(r!.rows[1]).toMatchObject({
      fips: "41051",
      value: 76.0,
      expected: 78.6,
      flag: "somewhat_worse",
    });
    expect(r!.median.value).toBeCloseTo(77.5);
    expect(r!.median.expected).toBeCloseTo(78.55);
  });

  test("returns null for a county with no peers", () => {
    const peers = { ...model.peers, counties: { "02016": [] } };
    expect(buildPeerRows("02016", peers, counties, values({}))).toBeNull();
    expect(buildPeerRows("99999", peers, counties, values({}))).toBeNull();
  });
});
