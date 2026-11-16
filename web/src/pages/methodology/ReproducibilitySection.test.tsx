import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest, lifeExpectancy as model } from "../../test/fixtures";
import { ReproducibilitySection } from "./ReproducibilitySection";

test("seed, folds, LightGBM version and parameters, and build date", () => {
  render(<ReproducibilitySection model={model} builtAt={manifest.built_at} />);
  expect(screen.getByRole("heading", { level: 4 })).toHaveAttribute("id", "model-card");
  const text = document.body.textContent ?? "";
  expect(text).toContain("Random seed1");
  expect(text).toContain("Cross-validation folds5");
  expect(text).toContain("LightGBM version4.0.0");
  expect(text).toContain("January 1, 2026");
  expect(text).toContain("learning_rate0.03");
  expect(text).toContain("deterministictrue");
});

test("shows the selected outcome's training counties", () => {
  render(<ReproducibilitySection model={model} builtAt={manifest.built_at} />);
  expect(document.body.textContent).toContain("OutcomeLife expectancy");
  expect(document.body.textContent).toContain("Training counties3,000");
});

test("the LightGBM parameters are in a closed fold", () => {
  render(<ReproducibilitySection model={model} builtAt={manifest.built_at} />);
  const fold = screen.getByText("learning_rate").closest("details")!;
  expect(fold).toHaveClass("methodology-fold");
  expect(fold).not.toHaveAttribute("open");
});
