import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { END_SENTINEL_ID, useScrollSpy } from "./useScrollSpy";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { cb: Callback; targets: Element[]; options?: IntersectionObserverInit }[] = [];

class FakeIO {
  entry: (typeof observers)[number];
  constructor(cb: Callback, options?: IntersectionObserverInit) {
    this.entry = { cb, targets: [], options };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.targets.push(el);
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => vi.unstubAllGlobals());

const IDS = ["sources", "model", "model-card"];
function Page() {
  const { current, pin } = useScrollSpy(IDS, true);
  return (
    <>
      <p data-testid="current">{current ?? "none"}</p>
      {IDS.map((id) => (
        <h4 key={id} id={id}>
          {id}
        </h4>
      ))}
      <button type="button" onClick={() => pin("model-card")}>
        pin
      </button>
      <div id={END_SENTINEL_ID} />
    </>
  );
}

const sections = () => observers.find((o) => o.targets.some((t) => t.id === "sources"))!;
const sentinel = () => observers.find((o) => o.targets.some((t) => t.id === END_SENTINEL_ID))!;
const cross = (id: string, above = true) =>
  act(() =>
    sections().cb([
      {
        target: document.getElementById(id)!,
        isIntersecting: false,
        boundingClientRect: { top: above ? -10 : 500 } as DOMRectReadOnly,
        rootBounds: { top: 100 } as DOMRectReadOnly,
      },
    ]),
  );
const now = () => screen.getByTestId("current").textContent;

test("current is null until a heading passes the line", () => {
  render(<Page />);
  expect(now()).toBe("none");
  cross("sources", false);
  expect(now()).toBe("none");
});

test("the last heading above the line is current", () => {
  render(<Page />);
  cross("sources");
  expect(now()).toBe("sources");
  cross("model");
  expect(now()).toBe("model");
  cross("model", false);
  expect(now()).toBe("sources");
});

test("the observer's root margin is a line below the header", () => {
  render(<Page />);
  expect(sections().options?.rootMargin).toMatch(/^-[\d.]+px 0px -[\d.]+px 0px$/);
});

test("the bottom sentinel makes the last id current", () => {
  render(<Page />);
  cross("sources");
  act(() =>
    sentinel().cb([{ target: document.getElementById(END_SENTINEL_ID)!, isIntersecting: true }]),
  );
  expect(now()).toBe("model-card");
  act(() =>
    sentinel().cb([{ target: document.getElementById(END_SENTINEL_ID)!, isIntersecting: false }]),
  );
  expect(now()).toBe("sources");
});

test("pin sets current at once and holds it until scrollend", () => {
  render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "pin" }));
  expect(now()).toBe("model-card");
  cross("sources");
  expect(now()).toBe("model-card");
  act(() => {
    window.dispatchEvent(new Event("scrollend"));
  });
  expect(now()).toBe("sources");
});

test("pin is also released by the reader's own input", () => {
  render(<Page />);
  cross("sources");
  fireEvent.click(screen.getByRole("button", { name: "pin" }));
  act(() => {
    window.dispatchEvent(new Event("wheel"));
  });
  expect(now()).toBe("sources");
});
