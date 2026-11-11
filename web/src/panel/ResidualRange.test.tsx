import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { tierFill } from "../model/modelView";
import { ResidualRange } from "./ResidualRange";

function dot(residual: number, flag: Parameters<typeof tierFill>[0], t90 = 3.37) {
  const { container } = render(
    <ResidualRange residual={residual} threshold75={2.36} threshold90={t90} flag={flag} />,
  );
  const circle = container.querySelector("circle")!;
  const zero = Number(container.querySelector("line")!.getAttribute("x1"));
  return { cx: Number(circle.getAttribute("cx")), r: Number(circle.getAttribute("r")), zero, fill: circle.getAttribute("fill") };
}

test("the dot takes the tier colour and sits on the side of its sign", () => {
  const pos = dot(3.7, "notably_better");
  expect(pos.fill).toBe(tierFill("notably_better"));
  expect(pos.cx).toBeGreaterThan(pos.zero);
  const neg = dot(-2.6, "somewhat_worse");
  expect(neg.fill).toBe(tierFill("somewhat_worse"));
  expect(neg.cx).toBeLessThan(neg.zero);
});

test("a residual far beyond t90 stays inside the viewBox", () => {
  const d = dot(11.8, "notably_better");
  expect(d.cx - d.r).toBeGreaterThanOrEqual(0);
  expect(d.cx + d.r).toBeLessThanOrEqual(320);
});

test("screen-reader text gives the meaning for each of the three cases", () => {
  const text = (r: number) => {
    const { container, unmount } = render(
      <ResidualRange residual={r} threshold75={2.36} threshold90={3.37} flag="none" />,
    );
    const t = container.querySelector(".visually-hidden")!.textContent;
    unmount();
    return t;
  };
  expect(text(3.7)).toBe("+3.7 years is beyond the ±3.4-year range for notably better or worse.");
  expect(text(2.6)).toBe("+2.6 years is beyond ±2.4 but within ±3.4 years, somewhat better or worse than expected.");
  expect(text(-0.5)).toBe("−0.5 years is within ±2.4 years, about as expected.");
});

function labels(residual: number, t75 = 2.36, t90 = 3.37) {
  const { container, unmount } = render(
    <ResidualRange residual={residual} threshold75={t75} threshold90={t90} flag="none" />,
  );
  const out = [...container.querySelectorAll("text.range-label")].map((t) => ({
    text: t.textContent,
    x: Number(t.getAttribute("x")),
  }));
  unmount();
  return out;
}

test("the axis labels zero and both ranges, left to right", () => {
  const l = labels(1.2);
  expect(l.map((x) => x.text)).toEqual(["−3.4", "−2.4", "0", "+2.4", "+3.4"]);
  const xs = l.map((x) => x.x);
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  for (const x of xs) {
    expect(x).toBeGreaterThanOrEqual(12);
    expect(x).toBeLessThanOrEqual(320 - 12);
  }
});

test("when the ranges would crowd together, only the outer range is labelled", () => {
  expect(labels(11.8).map((x) => x.text)).toEqual(["−3.4", "0", "+3.4"]);
});
