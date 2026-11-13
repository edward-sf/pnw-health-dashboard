import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { manifest, strata } from "../../test/fixtures";
import type { Indicator } from "../../types";
import { RaceBreakdownSection } from "./RaceBreakdownSection";

const base = manifest.indicators.find((i) => i.id === "life_expectancy") as Indicator;
const outcome = (id: string, label: string): Indicator => ({ ...base, id, label });
const profile = (id: string, label: string, universe: string | null): Indicator => ({
  ...base,
  id,
  label,
  category: "Demographics",
  profile: "other",
  universe,
});

const indicators: Indicator[] = [
  outcome("life_expectancy", "Life expectancy"),
  outcome("preventable_hospital_stays", "Preventable hospital stays"),
  profile("pct_veterans", "Veterans", "Civilian population 18 and over"),
  profile("pct_disability", "With a disability", "Civilian noninstitutionalized population"),
  profile("pct_asian", "Asian population", null),
];

function renderSection() {
  render(
    <MemoryRouter>
      <RaceBreakdownSection strata={strata} indicators={indicators} />
    </MemoryRouter>,
  );
  return document.body.textContent ?? "";
}

test("heading, id and the source year", () => {
  const text = renderSection();
  const h = screen.getByRole("heading", { level: 3, name: "Outcomes by race and ethnicity" });
  expect(h).toHaveAttribute("id", "race-breakdown");
  expect(h).toHaveAttribute("tabindex", "-1");
  expect(text).toContain("County Health Rankings 2025");
});

test("names the measures that have a breakdown, from the manifest labels", () => {
  const text = renderSection();
  expect(text).toContain("Life expectancy");
  expect(text).toContain("Preventable hospital stays");
  expect(text).not.toContain("Premature death");
});

test("says the breakdown is not mapped or ranked, and why", () => {
  const text = renderSection();
  expect(text).toMatch(/not mapped or ranked/);
  expect(text).toMatch(/few counties/);
});

test("explains the Chugach and Copper River gap and does not deny Idaho NHPI values", () => {
  const text = renderSection();
  expect(text).toMatch(/Chugach and Copper River/);
  expect(text).not.toMatch(/Idaho/);
});

test("Who lives here lists profile measures with their universes", () => {
  renderSection();
  expect(screen.getByRole("heading", { level: 4, name: "Who lives here" })).toBeInTheDocument();
  expect(screen.getByText(/Veterans/)).toHaveTextContent(/Civilian population 18 and over/);
  expect(screen.getByText(/With a disability/)).toHaveTextContent(
    /Civilian noninstitutionalized population/,
  );
  expect(screen.getByText(/Asian population/)).toBeInTheDocument();
  expect(document.body.textContent).toMatch(/never model features/);
});
