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
const ind = (
  id: string,
  label: string,
  profile: Indicator["profile"],
  extra: Partial<Indicator> = {},
): Indicator => ({ ...base, id, label, profile, ...extra });
const e = (v: number | null) => ({ v, lo: null, hi: null, rank: null, state_rank: null });

const indicators = [
  ind("pct_white", "White", "race"),
  ind("pct_black", "Black", "race"),
  ind("pct_zero", "Zero group", "race"),
  ind("poverty_rate", "Poverty rate", null, { category: "Social & Economic" }),
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

test("shows only indicators with a profile", () => {
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

const e2 = (v: number | null) => ({ v, lo: null, hi: null, rank: null, state_rank: null });
const profileIndicators = [
  ind("pct_veterans", "Veterans", "other", { universe: "Civilian population 18 and over" }),
  ind("pct_asian", "Asian population", "race"),
  ind("age_65_plus", "Age 65 and over", "age_sex", { category: "Social & Economic" }),
  ind("total_population", "Total population", "population", { unit: "count" }),
  ind("pct_female", "Female", "age_sex"),
];
const profileValues: ValuesFile = {
  pct_veterans: { "53033": e2(5) },
  pct_asian: { "53033": e2(22.1) },
  age_65_plus: { "53033": e2(15) },
  total_population: { "53033": e2(2269675) },
  pct_female: { "53033": e2(50.2) },
};
function setupProfile(inds: Indicator[] = profileIndicators) {
  const { container } = render(<WhoLivesHere fips="53033" indicators={inds} values={profileValues} />);
  return container.querySelector("section")!;
}

test("shows Population first as a number without a bar", () => {
  const section = setupProfile();
  const first = section.querySelector("li")!;
  expect(first.textContent).toContain("Total population");
  expect(first.textContent).toContain("2,269,675");
  expect(first.textContent).not.toContain("%");
  expect(first.querySelector(".who-track")).toBeNull();
  expect(first.closest(".who-group")!.querySelector("h4")).toBeNull();
});

test("groups rows under Age and sex, Race and ethnicity, Other, in catalog order", () => {
  const section = setupProfile();
  const headings = Array.from(section.querySelectorAll("h4")).map((h) => h.textContent);
  expect(headings).toEqual(["Age and sex", "Race and ethnicity", "Other"]);
  const labels = Array.from(section.querySelectorAll(".who-label")).map(
    (l) => l.firstChild!.textContent,
  );
  expect(labels).toEqual(["Total population", "Age 65 and over", "Female", "Asian population", "Veterans"]);
});

test("shows the universe under rows that have one", () => {
  const section = setupProfile();
  const row = Array.from(section.querySelectorAll("li")).find((r) => r.textContent?.includes("Veterans"))!;
  expect(row.textContent).toContain("Civilian population 18 and over");
  expect(section.textContent?.match(/Civilian population 18 and over/g)).toHaveLength(1);
});

test("omits a group with no indicators", () => {
  const section = setupProfile(profileIndicators.filter((i) => i.profile !== "other"));
  const headings = Array.from(section.querySelectorAll("h4")).map((h) => h.textContent);
  expect(headings).toEqual(["Age and sex", "Race and ethnicity"]);
});

test("includes age_65_plus though its category is Social & Economic", () => {
  const section = setupProfile();
  expect(section.textContent).toContain("Age 65 and over");
  expect(section.textContent).toContain("15.0%");
});

test("keeps the race note under the race group only", () => {
  const withRace = setupProfile();
  expect(withRace.textContent).toContain("Shares do not overlap");
  const { container } = render(
    <WhoLivesHere fips="53033" indicators={profileIndicators.filter((i) => i.profile !== "race")} values={profileValues} />,
  );
  expect(container.textContent).not.toContain("Shares do not overlap");
});
