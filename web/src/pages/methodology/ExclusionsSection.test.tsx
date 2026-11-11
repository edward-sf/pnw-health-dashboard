import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { model } from "../../test/fixtures";
import { ExclusionsSection } from "./ExclusionsSection";

test("feature groups, behaviors comparison and excluded counties", () => {
  render(<ExclusionsSection model={model} />);
  expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute("id", "exclusions");
  const text = document.body.textContent ?? "";
  expect(text).toContain("Behaviors: Health behaviors closely restate the outcome.");
  expect(text).toContain("Kentucky");
  expect(text).toContain("120 counties");
  expect(text).toMatch(/only the behaviors model's accuracy metrics are used/i);
  expect(text).toContain("2 counties in Connecticut: Connecticut reports planning regions, not counties.");
  expect(text).toContain("1 county in Hawaii: No features available.");
  const table = screen.getByRole("table");
  expect(within(table).getAllByText("With behaviors")).toHaveLength(2);
  expect(within(table).getAllByText("Main model")).toHaveLength(2);
});

test("an excluded state FIPS the web doesn't know is shown raw", () => {
  const odd = {
    ...model,
    behaviors_comparison: {
      ...model.behaviors_comparison,
      excluded_states: [{ state_fips: "99", counties: 3, reason: "r" }],
    },
  };
  render(<ExclusionsSection model={odd} />);
  expect(document.body.textContent).toContain("99: 3 counties");
  expect(document.body.textContent).not.toContain("undefined");
});
