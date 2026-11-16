import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FactorBars } from "./FactorBars";

const items = [
  { label: "Alpha", value: 4, display: "4.0 years" },
  { label: "Beta", value: 2, display: "2.0 years" },
  { label: "Gamma", value: 1, display: "1.0 years" },
];

test("renders a bar per item, scaled to the largest", () => {
  const { container } = render(<FactorBars items={items} />);
  const bars = container.querySelectorAll<HTMLElement>(".factor-bar");
  expect(bars).toHaveLength(3);
  expect(bars[0]!.style.width).toBe("100%");
  expect(bars[1]!.style.width).toBe("50%");
  expect(bars[2]!.style.width).toBe("25%");
});

test("every label and display is visible text", () => {
  render(<FactorBars items={items} />);
  for (const i of items) {
    expect(screen.getByText(i.label)).toBeVisible();
    expect(screen.getByText(i.display)).toBeVisible();
  }
});
