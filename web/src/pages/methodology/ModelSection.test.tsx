import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest, model } from "../../test/fixtures";
import { formatCount } from "./format";
import { ModelSection } from "./ModelSection";

test("training, validation, metrics, importance and tiers", () => {
  render(<ModelSection model={model} indicators={manifest.indicators} />);
  expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute("id", "model");
  const text = document.body.textContent ?? "";
  expect(text).toContain(`${formatCount(model.model_card.training_counties)} US counties`);
  expect(text).toContain(`${model.model_card.n_folds}-fold cross-validation`);
  expect(text).toContain("TargetLife expectancy");
  const table = screen.getByRole("table");
  expect(within(table).getAllByText("Ridge baseline")).toHaveLength(2);
  expect(within(table).getAllByText("LightGBM")).toHaveLength(2);
  const ranked = within(screen.getByRole("list", { name: "Factors by importance" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
  expect(ranked[0]).toMatch(/^Bachelor's degree or higher/);
  expect(ranked[1]).toMatch(/^Poverty rate/);
  expect(ranked[3]).toMatch(/^unemployment_rate/);
  expect(text).toContain("z × √(σ_model² + se²)");
  expect(text).toContain("1.15");
  expect(text).toContain("1.64");
  expect(text).toContain("1.2 years");
  expect(text).toMatch(/positive difference means better than expected/i);
  expect(text).toMatch(/average se²/);
});

test("the no-result heading is a focusable deep-link target", () => {
  render(<ModelSection model={model} indicators={manifest.indicators} />);
  const heading = screen.getByRole("heading", { level: 4, name: "Counties with no result" });
  expect(heading).toHaveAttribute("id", "no-result");
  expect(heading).toHaveAttribute("tabindex", "-1");
});
