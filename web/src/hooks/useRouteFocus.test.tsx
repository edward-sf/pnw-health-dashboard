import { act, fireEvent, render, screen } from "@testing-library/react";
import { startTransition, useState } from "react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Navigate, Route, Routes, useNavigate } from "react-router";
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

// Navigates in a transition, as React Router does in the browser, so React may run passive
// effects (and their cleanups) after the commit's microtasks.
function TransitionLink({ to, children }: { to: string; children: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => startTransition(() => void navigate(to))}>
      {children}
    </button>
  );
}

function Shell() {
  useRouteFocus();
  return (
    <>
      <button type="button">Elsewhere</button>
      <TransitionLink to="/b#sub">B sub in a transition</TransitionLink>
      <Link to="/late">Late</Link>
      <Link to="/late#x">Late x</Link>
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
  const late = screen.getByRole("link", { name: "Late" });
  await user.click(late);
  // fireEvent keeps focus on "Late", the element the pending wait recorded, so only the
  // cancel (not the user-moved-focus guard) stops a leftover wait from taking it. The hash
  // URL means the new route itself leaves focus alone.
  fireEvent.click(screen.getByRole("link", { name: "B sub" }));
  await screen.findByRole("heading", { name: "B page" });
  expect(late).toHaveFocus();
});

test("a hash-only change on the same path cancels the wait", async () => {
  const user = userEvent.setup();
  at("/");
  const late = screen.getByRole("link", { name: "Late" });
  await user.click(late);
  // Same pathname, new hash: only the hash dependency re-runs the effect and cancels the wait.
  // fireEvent keeps focus on "Late", so a leftover wait would take it for the late heading.
  fireEvent.click(screen.getByRole("link", { name: "Late x" }));
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByRole("heading", { name: "Late page" });
  expect(late).toHaveFocus();
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

test("a transition navigation cancels the wait before the new page's heading appears", async () => {
  const user = userEvent.setup();
  at("/");
  const late = screen.getByRole("link", { name: "Late" });
  await user.click(late);
  // Outside act, React schedules a transition's passive effects as a separate task, after the
  // MutationObserver's microtask, just as in the browser. A wait cancelled only in a passive
  // cleanup would see B's heading first and take focus from "Late".
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const prev = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    late.focus();
    screen.getByRole("button", { name: "B sub in a transition" }).click();
    late.focus();
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = prev;
  }
  expect(screen.getByRole("heading", { name: "B page" })).toBeInTheDocument();
  expect(late).toHaveFocus();
});
