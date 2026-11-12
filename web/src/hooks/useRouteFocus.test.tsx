import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Navigate, Route, Routes } from "react-router";
import { expect, test } from "vitest";
import { useRouteFocus } from "./useRouteFocus";

// A page whose heading renders only after a "load", like the Explorer while data loads.
function LatePage() {
  const [loaded, setLoaded] = useState(false);
  return loaded ? (
    <h2 data-page-heading tabIndex={-1}>
      Late page
    </h2>
  ) : (
    <button type="button" onClick={() => setLoaded(true)}>
      Load
    </button>
  );
}

function Shell() {
  useRouteFocus();
  return (
    <>
      <button type="button">Elsewhere</button>
      <Link to="/late">Late</Link>
      <Link to="/">Home</Link>
      <Link to="/b">B</Link>
      <Link to="/b#sub">B sub</Link>
      <Link to="/?x=1">Home query</Link>
      <Routes>
        <Route
          path="/"
          element={
            <h2 data-page-heading tabIndex={-1}>
              Home page
            </h2>
          }
        />
        <Route
          path="/b"
          element={
            <>
              <h2 data-page-heading tabIndex={-1}>
                B page
              </h2>
              <h3 id="sub" tabIndex={-1}>
                Sub
              </h3>
            </>
          }
        />
        <Route path="/late" element={<LatePage />} />
        <Route path="*" element={<Navigate to="/late" replace />} />
      </Routes>
    </>
  );
}

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Shell />
    </MemoryRouter>,
  );

test("the initial render does not move focus", () => {
  at("/");
  expect(document.body).toHaveFocus();
});

test("a pathname change focuses the new page heading", async () => {
  const user = userEvent.setup();
  at("/");
  await user.click(screen.getByRole("link", { name: "B" }));
  expect(screen.getByRole("heading", { name: "B page" })).toHaveFocus();
  await user.click(screen.getByRole("link", { name: "Home" }));
  expect(screen.getByRole("heading", { name: "Home page" })).toHaveFocus();
});

test("a pathname change with a hash leaves focus alone", async () => {
  const user = userEvent.setup();
  at("/");
  const link = screen.getByRole("link", { name: "B sub" });
  await user.click(link);
  expect(screen.getByRole("heading", { name: "B page" })).not.toHaveFocus();
});

test("a search-only change leaves focus alone", async () => {
  const user = userEvent.setup();
  at("/");
  const link = screen.getByRole("link", { name: "Home query" });
  await user.click(link);
  expect(link).toHaveFocus();
});

test("a heading that renders after the route change gets focus", async () => {
  const user = userEvent.setup();
  at("/");
  await user.click(screen.getByRole("link", { name: "Late" }));
  await user.click(screen.getByRole("button", { name: "Load" }));
  expect(await screen.findByRole("heading", { name: "Late page" })).toHaveFocus();
});

test("leaving before the heading renders cancels the wait", async () => {
  const user = userEvent.setup();
  at("/");
  await user.click(screen.getByRole("link", { name: "Late" }));
  // A URL with a hash leaves focus to the hash target, so a leftover wait must not take it.
  await user.click(screen.getByRole("link", { name: "B sub" }));
  expect(await screen.findByRole("heading", { name: "B page" })).not.toHaveFocus();
});

test("a cold redirect while loading focuses the heading once it renders", async () => {
  const user = userEvent.setup();
  at("/nowhere");
  await user.click(screen.getByRole("button", { name: "Load" }));
  expect(await screen.findByRole("heading", { name: "Late page" })).toHaveFocus();
});

test("a late heading takes focus from the link that navigated", async () => {
  const user = userEvent.setup();
  at("/");
  await user.click(screen.getByRole("link", { name: "Late" }));
  // fireEvent, unlike userEvent, doesn't move focus, so the link still has it.
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  expect(await screen.findByRole("heading", { name: "Late page" })).toHaveFocus();
});

test("a late heading doesn't take focus the user has moved elsewhere", async () => {
  const user = userEvent.setup();
  at("/");
  await user.click(screen.getByRole("link", { name: "Late" }));
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  await user.click(elsewhere);
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByRole("heading", { name: "Late page" });
  expect(elsewhere).toHaveFocus();
});

test("unmounting while waiting cancels the wait", async () => {
  const user = userEvent.setup();
  const { unmount } = at("/");
  await user.click(screen.getByRole("link", { name: "Late" }));
  unmount();
  const stray = document.createElement("h2");
  stray.setAttribute("data-page-heading", "");
  stray.tabIndex = -1;
  await act(async () => {
    document.body.append(stray);
    await Promise.resolve();
  });
  expect(stray).not.toHaveFocus();
  stray.remove();
});
