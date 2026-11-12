import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { manifest } from "../test/fixtures";
import { IndicatorPicker } from "./IndicatorPicker";

const setup = (selectedId = "poverty_rate", onSelect = vi.fn()) => {
  render(
    <IndicatorPicker indicators={manifest.indicators} selectedId={selectedId} onSelect={onSelect} />,
  );
  return onSelect;
};

test("groups by category in catalog order", () => {
  setup();
  const groups = screen.getAllByRole("group");
  expect(groups.map((g) => within(g).getByRole("heading").textContent)).toEqual([
    "Social & Economic",
    "Demographics",
    "Outcomes",
  ]);
  expect(within(groups[0]!).getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Poverty rate",
    "Median household income",
    "Bachelor's degree or higher",
  ]);
});

test("each group has an accessible name from its category", () => {
  setup();
  expect(screen.getByRole("group", { name: "Social & Economic" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Demographics" })).toBeInTheDocument();
});

test("filters case-insensitively by label", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Filter indicators"), "INCOME");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Median household income",
  ]);
  expect(screen.queryByText("Demographics")).not.toBeInTheDocument();
});

test("shows 'No indicators match' when nothing matches", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Filter indicators"), "zzz");
  expect(screen.getByText("No indicators match")).toBeInTheDocument();
});

test("marks the selected option aria-pressed", () => {
  setup("pct_asian");
  expect(screen.getByRole("button", { name: "Asian population" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Poverty rate" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("is operable by keyboard", async () => {
  const onSelect = setup();
  await userEvent.tab(); // filter input
  await userEvent.tab(); // first option
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("poverty_rate");
});

describe("collapsible", () => {
  const setupCollapsible = (onSelect = vi.fn()) => {
    render(
      <IndicatorPicker
        indicators={manifest.indicators}
        selectedId="poverty_rate"
        onSelect={onSelect}
        collapsible
      />,
    );
    return onSelect;
  };

  test("starts closed with a button naming the indicator", () => {
    setupCollapsible();
    const toggle = screen.getByRole("button", { name: "Indicator: Poverty rate" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Filter indicators")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Median household income" })).not.toBeInTheDocument();
  });

  test("opening shows the search box", async () => {
    setupCollapsible();
    await userEvent.click(screen.getByRole("button", { name: "Indicator: Poverty rate" }));
    expect(screen.getByRole("button", { name: "Indicator: Poverty rate" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Filter indicators")).toBeInTheDocument();
  });

  test("choosing an indicator selects it, closes and focuses the button", async () => {
    const onSelect = setupCollapsible();
    await userEvent.click(screen.getByRole("button", { name: "Indicator: Poverty rate" }));
    await userEvent.click(screen.getByRole("button", { name: "Median household income" }));
    expect(onSelect).toHaveBeenCalledWith("median_household_income");
    const toggle = screen.getByRole("button", { name: "Indicator: Poverty rate" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(screen.queryByLabelText("Filter indicators")).not.toBeInTheDocument();
  });

  test("Escape closes it, prevents default and focuses the button", async () => {
    setupCollapsible();
    await userEvent.click(screen.getByRole("button", { name: "Indicator: Poverty rate" }));
    const input = screen.getByLabelText("Filter indicators");
    input.focus();
    const notCancelled = fireEvent.keyDown(input, { key: "Escape" });
    expect(notCancelled).toBe(false);
    const toggle = screen.getByRole("button", { name: "Indicator: Poverty rate" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });
});
