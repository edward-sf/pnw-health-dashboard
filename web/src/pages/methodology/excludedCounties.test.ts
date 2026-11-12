import { expect, test } from "vitest";
import { lifeExpectancy as model } from "../../test/fixtures";
import { groupExcludedCounties } from "./excludedCounties";

test("groups the fixture's excluded counties by reason", () => {
  expect(groupExcludedCounties(model.model_card.excluded_counties)).toEqual([
    {
      reason: "Connecticut reports planning regions, not counties.",
      count: 2,
      states: ["Connecticut"],
    },
    { reason: "No features available.", count: 1, states: ["Hawaii"] },
  ]);
});

test("sorts by count, then reason; states are distinct in first-seen order", () => {
  expect(
    groupExcludedCounties([
      { fips: "53001", reason: "b" },
      { fips: "41001", reason: "a" },
      { fips: "16001", reason: "c" },
      { fips: "16003", reason: "c" },
      { fips: "53003", reason: "c" },
      { fips: "99001", reason: "c" },
    ]),
  ).toEqual([
    { reason: "c", count: 4, states: ["Idaho", "Washington", "99"] },
    { reason: "a", count: 1, states: ["Oregon"] },
    { reason: "b", count: 1, states: ["Washington"] },
  ]);
});

test("an empty list gives no groups", () => {
  expect(groupExcludedCounties([])).toEqual([]);
});
