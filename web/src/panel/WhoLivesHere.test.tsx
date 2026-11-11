import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Indicator, ValuesFile } from "../types";
import { WhoLivesHere } from "./WhoLivesHere";

const base: Indicator = {
  id: "x",
  label: "X",
  unit: "percent",
  source: "acs",
  source_field: "f",
  moe_field: null,
  ci_level: null,
  year: 2023,
  category: "Demographics",
  direction: "neutral",
  description: "d",
};
const ind = (id: string, label: string, category: Indicator["category"] = "Demographics"): Indicator => ({
  ...base,
  id,
  label,
  category,
});
const e = (v: number | null) => ({ v, lo: null, hi: null, rank: null, state_rank: null });

const indicators = [
  ind("pct_white", "White"),
  ind("pct_black", "Black"),
  ind("pct_zero", "Zero group"),
  ind("poverty_rate", "Poverty rate", "Social & Economic"),
];
const values: ValuesFile = {
  pct_white: { "53033": e(60.25) },
  pct_black: { "53033": e(null) },
  pct_zero: { "53033": e(0) },
  poverty_rate: { "53033": e(9.5) },
};

function setup() {
  const { container } = render(<WhoLivesHere fips="53033" indicators={indicators} values={values} />);
  return container.querySelector("section")!;
}

test("renders a labelled section with heading", () => {
  const section = setup();
  const h = section.querySelector("h3")!;
  expect(h.textContent).toBe("Who lives here");
  expect(section.getAttribute("aria-labelledby")).toBe(h.id);
});

test("shows only Demographics indicators", () => {
  const section = setup();
  expect(section.textContent).toContain("White");
  expect(section.textContent).not.toContain("Poverty rate");
});

test("null shows Not available with no bar; zero shows 0.0% with bar", () => {
  const section = setup();
  const rows = Array.from(section.querySelectorAll("li"));
  const black = rows.find((r) => r.textContent?.includes("Black"))!;
  expect(black.textContent).toContain("Not available");
  expect(black.querySelector("span[style]")).toBeNull();
  const zero = rows.find((r) => r.textContent?.includes("Zero group"))!;
  expect(zero.textContent).toContain("0.0%");
  expect(zero.textContent).not.toContain("Not available");
  expect(zero.querySelector("span[style]")).not.toBeNull();
});

test("includes the overlap note and no evaluative language", () => {
  const section = setup();
  expect(section.textContent).toContain(
    "Shares do not overlap. People who identify with more than one race are counted under two or more races, so the American Indian and Alaska Native share undercounts them. Some other race is not shown, so shares may not sum to 100%.",
  );
  expect(section.textContent).not.toMatch(/model|expected|flag|life expectancy|better|worse/i);
});
