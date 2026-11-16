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
const tops: Record<string, number> = {};
/** Puts each heading at a top, then fires the section observer as the browser would. */
const place = (next: Record<string, number>) => {
  Object.assign(tops, next);
  act(() => sections().cb([]));
};
const now = () => screen.getByTestId("current").textContent;

beforeEach(() => {
  for (const id of IDS) tops[id] = 800;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return { top: tops[this.id] ?? 0 } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());

test("current is null until a heading reaches the line", () => {
  render(<Page />);
  expect(now()).toBe("none");
  place({ sources: 700 });
  expect(now()).toBe("none");
});

test("the last heading at or above the line is current", () => {
  render(<Page />);
  place({ sources: -10 });
  expect(now()).toBe("sources");
  place({ model: 0 });
  expect(now()).toBe("model");
  place({ model: 500 });
  expect(now()).toBe("sources");
});

test("a jump that skips the band still lands right", () => {
  render(<Page />);
  place({ sources: -3000, model: -1500, "model-card": 40 });
  expect(now()).toBe("model-card");
});

test("the observed band runs from the viewport top to the reading line", () => {
  render(<Page />);
  expect(sections().options?.rootMargin).toMatch(/^0px 0px -[\d.]+px 0px$/);
});

test("the bottom sentinel makes the last id current", () => {
  render(<Page />);
  place({ sources: -10 });
  act(() =>
    sentinel().cb([{ target: document.getElementById(END_SENTINEL_ID)!, isIntersecting: true }]),
  );
  expect(now()).toBe("model-card");
  act(() =>
    sentinel().cb([{ target: document.getElementById(END_SENTINEL_ID)!, isIntersecting: false }]),
  );
  expect(now()).toBe("sources");
});

test("pin sets current at once and holds it; release recomputes from the headings", () => {
  render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "pin" }));
  expect(now()).toBe("model-card");
  place({ sources: -10 });
  expect(now()).toBe("model-card");
  act(() => {
    window.dispatchEvent(new Event("scrollend"));
  });
  expect(now()).toBe("sources");
});

test("pin released with no observer entry in between still settles on the headings", () => {
  render(<Page />);
  Object.assign(tops, { sources: -900, model: 10 });
  fireEvent.click(screen.getByRole("button", { name: "pin" }));
  act(() => {
    window.dispatchEvent(new Event("scrollend"));
  });
  expect(now()).toBe("model");
});

test("pin is also released by the reader's own input", () => {
  render(<Page />);
  place({ sources: -10 });
  fireEvent.click(screen.getByRole("button", { name: "pin" }));
  act(() => {
    window.dispatchEvent(new Event("wheel"));
  });
  expect(now()).toBe("sources");
});
