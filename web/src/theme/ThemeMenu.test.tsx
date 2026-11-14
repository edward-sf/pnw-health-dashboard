import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { mockMatchMedia } from "../test/matchMedia";
import { STORAGE_KEY } from "./theme";
import { ThemeMenu } from "./ThemeMenu";
import { ThemeProvider } from "./ThemeProvider";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

function renderMenu() {
  return render(
    <ThemeProvider>
      <ThemeMenu />
    </ThemeProvider>,
  );
}

test("a Theme button opens Light, Dark and System, with System checked by default", async () => {
  const user = userEvent.setup();
  renderMenu();
  await user.click(screen.getByRole("button", { name: "Theme" }));
  const items = screen.getAllByRole("menuitemradio");
  expect(items.map((i) => i.textContent)).toEqual(["Light", "Dark", "System"]);
  expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
});

test("choosing Dark adds the dark class to <html> and stores dark", async () => {
  const user = userEvent.setup();
  renderMenu();
  expect(document.documentElement).not.toHaveClass("dark");
  await user.click(screen.getByRole("button", { name: "Theme" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
});

test("with a throwing storage, choosing Dark still adds the class", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const user = userEvent.setup();
  renderMenu();
  await user.click(screen.getByRole("button", { name: "Theme" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
  expect(document.documentElement).toHaveClass("dark");
});

test("System follows the OS setting as it changes", () => {
  const media = mockMatchMedia(false);
  renderMenu();
  expect(document.documentElement).not.toHaveClass("dark");
  act(() => media.set(true));
  expect(document.documentElement).toHaveClass("dark");
});

test("choosing Light overrides a dark OS setting", async () => {
  mockMatchMedia(true);
  const user = userEvent.setup();
  renderMenu();
  expect(document.documentElement).toHaveClass("dark");
  await user.click(screen.getByRole("button", { name: "Theme" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
  expect(document.documentElement).not.toHaveClass("dark");
});

test("an open menu leaves the page behind it exposed to assistive technology", async () => {
  const user = userEvent.setup();
  const { container } = renderMenu();
  await user.click(screen.getByRole("button", { name: "Theme" }));
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
  // A modal menu aria-hides its siblings while their controls stay tabbable (axe aria-hidden-focus).
  expect(container).not.toHaveAttribute("aria-hidden");
  expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();
});
