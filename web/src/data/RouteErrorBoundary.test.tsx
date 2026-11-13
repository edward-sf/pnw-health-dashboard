import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Broken(): never {
  throw new Error("render failed");
}

afterEach(() => vi.restoreAllMocks());

test("renders its children when nothing throws", () => {
  render(
    <RouteErrorBoundary>
      <p>Page content</p>
    </RouteErrorBoundary>,
  );
  expect(screen.getByText("Page content")).toBeInTheDocument();
});

test("renders the fallback when a child throws, and reloads on request", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const reload = vi.fn();
  render(
    <RouteErrorBoundary onReload={reload}>
      <Broken />
    </RouteErrorBoundary>,
  );
  // Only the message is a live alert; the focused heading announces itself, so it sits
  // outside the alert and isn't read twice.
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(
    "This page couldn't be shown. Reloading the page usually fixes it.",
  );
  const heading = screen.getByRole("heading", { name: "Something went wrong" });
  expect(alert).not.toContainElement(heading);
  expect(alert).not.toContainElement(
    screen.getByRole("button", { name: "Reload the page" }),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Reload the page" }));
  expect(reload).toHaveBeenCalledTimes(1);
});

test("moves focus to the fallback heading when a child throws", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <RouteErrorBoundary>
      <Broken />
    </RouteErrorBoundary>,
  );
  expect(
    screen.getByRole("heading", { name: "Something went wrong" }),
  ).toHaveFocus();
});

test("moves focus to the fallback heading when a mounted page later throws", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Flaky({ broken }: { broken: boolean }) {
    if (broken) throw new Error("render failed");
    return (
      <h1 data-page-heading="" tabIndex={-1}>
        Page
      </h1>
    );
  }
  const { rerender } = render(
    <RouteErrorBoundary>
      <Flaky broken={false} />
    </RouteErrorBoundary>,
  );
  screen.getByRole("heading", { name: "Page" }).focus();
  rerender(
    <RouteErrorBoundary>
      <Flaky broken />
    </RouteErrorBoundary>,
  );
  expect(
    screen.getByRole("heading", { name: "Something went wrong" }),
  ).toHaveFocus();
});
