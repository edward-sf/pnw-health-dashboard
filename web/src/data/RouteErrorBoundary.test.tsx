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
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Reload the page" }));
  expect(reload).toHaveBeenCalledTimes(1);
});
