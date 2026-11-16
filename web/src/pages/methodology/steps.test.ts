import { expect, test } from "vitest";
import { SECTION_IDS, STEPS } from "./steps";

test("the steps are Fetch, Harmonize, Model, Publish", () => {
  expect(STEPS.map((s) => s.name)).toEqual(["Fetch", "Harmonize", "Model", "Publish"]);
  expect(STEPS.map((s) => s.id)).toEqual(["fetch", "harmonize", "model-step", "publish"]);
});

test("sections per step and their rail labels", () => {
  expect(STEPS.map((s) => s.sections.map((x) => [x.id, x.railLabel]))).toEqual([
    [
      ["sources", "Sources and vintages"],
      ["indicators", "Indicators"],
    ],
    [
      ["harmonization", "Geography"],
      ["missing-data", "Missing and uncertain values"],
      ["race-breakdown", "Outcomes by race and ethnicity"],
    ],
    [
      ["model", "How it works"],
      ["exclusions", "What it leaves out"],
      ["similar-counties", "Similar counties"],
    ],
    [["model-card", "Reproduce it"]],
  ]);
});

test("SECTION_IDS flattens in page order", () => {
  expect(SECTION_IDS).toEqual([
    "sources",
    "indicators",
    "harmonization",
    "missing-data",
    "race-breakdown",
    "model",
    "exclusions",
    "similar-counties",
    "model-card",
  ]);
});
