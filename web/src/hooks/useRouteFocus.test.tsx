import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { expect, test } from "vitest";
import { useRouteFocus } from "./useRouteFocus";

function Shell() {
  useRouteFocus();
  return (
    <>
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
