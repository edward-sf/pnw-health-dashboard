import { expect, test } from "vitest";
import { manifest } from "../test/fixtures";
import { GROUPS, groupOf, measuresIn } from "./categories";

test("groupOf maps the five manifest categories", () => {
  expect(["Social & Economic", "Access", "Behaviors"].map(groupOf)).toEqual([
    "indicators",
    "indicators",
    "indicators",
  ]);
  expect(groupOf("Demographics")).toBe("demographics");
  expect(groupOf("Outcomes")).toBe("outcomes");
});

test("an unknown category falls under indicators", () => {
  expect(groupOf("Housing")).toBe("indicators");
});

test("GROUPS lists the three groups in order", () => {
  expect(GROUPS.map((g) => g.label)).toEqual(["Indicators", "Demographics", "Outcomes"]);
});

test("measuresIn keeps manifest order and one heading per category", () => {
  const behaviors = { ...manifest.indicators[0]!, id: "smoking", category: "Behaviors" as const };
  const indicators = [...manifest.indicators, behaviors];
  const sections = measuresIn(indicators, "indicators");
  expect(sections.map((s) => s.heading)).toEqual(["Social & Economic", "Behaviors"]);
  expect(sections[0]!.items.map((x) => x.id)).toEqual([
    "poverty_rate",
    "median_household_income",
    "bachelors_or_higher",
  ]);
  expect(sections[1]!.items.map((x) => x.id)).toEqual(["smoking"]);
  expect(measuresIn(indicators, "demographics").map((s) => s.heading)).toEqual(["Demographics"]);
  expect(measuresIn(indicators, "outcomes")[0]!.items.map((x) => x.id)).toEqual(["life_expectancy"]);
});

test("a group with no measures has no sections", () => {
  expect(measuresIn([], "outcomes")).toEqual([]);
});
