import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { mockMatchMedia } from "../test/matchMedia";
import { PanelShell } from "./PanelShell";

function setup(onClose = vi.fn()) {
  render(
    <>
      <button type="button">Outside</button>
      <PanelShell onClose={onClose}>
        <h2>King County</h2>
        <button type="button">Inside</button>
      </PanelShell>
    </>,
  );
  return onClose;
}

test("is a dialog named County details", () => {
  setup();
  const dialog = screen.getByRole("dialog", { name: "County details" });
  expect(dialog).toHaveClass("county-panel");
  // The visually hidden title is not a heading; the county name is the panel's only h2.
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
});

test("a pointer press outside does not close it", async () => {
  const onClose = setup();
  await userEvent.click(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Outside" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument();
});

test("Escape closes it", async () => {
  const onClose = setup();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

test("Escape closes it while focus is outside the panel", async () => {
  const onClose = setup();
  screen.getByRole("button", { name: "Outside" }).focus();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

test("opening does not move focus", () => {
  const before = document.activeElement;
  setup();
  expect(document.activeElement).toBe(before);
});

test("phone: renders the drawer, with no Expand button", () => {
  mockMatchMedia(true);
  setup();
  const dialog = screen.getByRole("dialog", { name: "County details" });
  expect(dialog).toHaveAttribute("data-vaul-drawer");
  expect(dialog).toHaveClass("county-panel");
  expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
});

test("phone: Escape closes the drawer", async () => {
  mockMatchMedia(true);
  const onClose = setup();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

test("phone: the page behind stays reachable and a press outside does not close it", async () => {
  mockMatchMedia(true);
  const onClose = setup();
  // A modal drawer would hide the rest of the page from assistive technology and trap focus.
  const outside = screen.getByRole("button", { name: "Outside" });
  await userEvent.click(outside);
  expect(outside).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
  expect(document.body.style.pointerEvents).not.toBe("none");
});
