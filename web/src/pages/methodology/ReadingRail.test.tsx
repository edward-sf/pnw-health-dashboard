import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mockMatchMedia } from "../../test/matchMedia";
import { ReadingRail } from "./ReadingRail";
import { STEPS } from "./steps";

test("desktop: a nav lists each step followed by its sections as links", () => {
  render(<ReadingRail current={null} onPick={() => {}} />);
  const nav = screen.getByRole("navigation", { name: "On this page" });
  for (const step of STEPS) {
    expect(nav).toHaveTextContent(step.name);
    for (const { id, railLabel } of step.sections) {
      expect(screen.getByRole("link", { name: railLabel })).toHaveAttribute("href", `#${id}`);
    }
  }
  expect(screen.queryByRole("button")).toBeNull();
});

test("desktop: the current section and its step are marked", () => {
  render(<ReadingRail current="model" onPick={() => {}} />);
  expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  expect(screen.getByRole("link", { name: "Indicators" })).not.toHaveAttribute("aria-current");
  expect(screen.getByText("Model")).toHaveClass("is-current");
  expect(screen.getByText("Fetch")).not.toHaveClass("is-current");
});

test("desktop: a plain click calls onPick and does not follow the href", async () => {
  const onPick = vi.fn();
  render(<ReadingRail current={null} onPick={onPick} />);
  await userEvent.setup().click(screen.getByRole("link", { name: "Indicators" }));
  expect(onPick).toHaveBeenCalledWith("indicators");
});

test("phone: the button names the current section, or the page", () => {
  mockMatchMedia(true);
  const { rerender } = render(<ReadingRail current="model" onPick={() => {}} />);
  expect(screen.getByRole("button", { name: "Model · How it works" })).toBeInTheDocument();
  rerender(<ReadingRail current={null} onPick={() => {}} />);
  expect(screen.getByRole("button", { name: "On this page" })).toBeInTheDocument();
});

test("phone: the button opens the list, and picking closes it", async () => {
  mockMatchMedia(true);
  const onPick = vi.fn();
  const user = userEvent.setup();
  render(<ReadingRail current={null} onPick={onPick} />);
  const button = screen.getByRole("button", { name: "On this page" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: "Reproduce it" })).toBeNull();
  await user.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("link", { name: "Reproduce it" }));
  expect(onPick).toHaveBeenCalledWith("model-card");
  expect(screen.queryByRole("link", { name: "Reproduce it" })).toBeNull();
  expect(button).toHaveAttribute("aria-expanded", "false");
});

test("phone: Escape closes the list", async () => {
  mockMatchMedia(true);
  const user = userEvent.setup();
  render(<ReadingRail current={null} onPick={() => {}} />);
  await user.click(screen.getByRole("button", { name: "On this page" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("link", { name: "Reproduce it" })).toBeNull();
});
