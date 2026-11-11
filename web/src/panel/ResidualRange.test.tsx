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
