import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { useHashFocus } from "./useHashFocus";

function Page({ ready }: { ready: boolean }) {
  useHashFocus(ready);
  return (
    <>
      <Link to={{ hash: "b" }}>Go to b</Link>
      {ready && (
        <>
          <h2 id="a" tabIndex={-1}>
            A
          </h2>
          <h2 id="b" tabIndex={-1}>
            B
          </h2>
        </>
      )}
    </>
  );
}

const at = (path: string, ready = true) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Page ready={ready} />
    </MemoryRouter>,
  );

test("focuses and scrolls to the heading the hash names", () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  at("/methodology#a");
  expect(screen.getByRole("heading", { name: "A" })).toHaveFocus();
  expect(scroll).toHaveBeenCalledTimes(1);
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

test("works without scrollIntoView (jsdom)", () => {
  at("/methodology#a");
  expect(screen.getByRole("heading", { name: "A" })).toHaveFocus();
});

test("waits until ready", () => {
  const { rerender } = at("/methodology#b", false);
  expect(document.body).toHaveFocus();
  rerender(
    <MemoryRouter initialEntries={["/methodology#b"]}>
      <Page ready />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "B" })).toHaveFocus();
});

test("reruns when the hash changes", async () => {
  const user = userEvent.setup();
  at("/methodology#a");
  await user.click(screen.getByRole("link", { name: "Go to b" }));
  expect(screen.getByRole("heading", { name: "B" })).toHaveFocus();
});

test("refocuses when the same link is clicked twice", async () => {
  const user = userEvent.setup();
  at("/methodology");
  const link = screen.getByRole("link", { name: "Go to b" });
  const b = screen.getByRole("heading", { name: "B" });
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  await user.click(link);
  expect(b).toHaveFocus();
  // The second click moves focus to the link first; only a rerun of the hook moves it back.
  await user.click(link);
  expect(b).toHaveFocus();
  expect(scroll).toHaveBeenCalledTimes(2);
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

test("ignores a hash with no match", () => {
  at("/methodology#nope");
  expect(document.body).toHaveFocus();
});
