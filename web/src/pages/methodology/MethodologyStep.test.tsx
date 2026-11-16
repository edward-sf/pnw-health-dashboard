import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MethodologyStep } from "./MethodologyStep";
import { SectionLayout } from "./SectionLayout";
import { HARMONIZE } from "./steps";

test("a step renders a labelled h3 with its id and position", () => {
  render(
    <MethodologyStep step={HARMONIZE} index={1}>
      <p>body</p>
    </MethodologyStep>,
  );
  const h = screen.getByRole("heading", { level: 3, name: /Harmonize/ });
  expect(h).toHaveAttribute("id", "harmonize");
  expect(h).toHaveAttribute("tabindex", "-1");
  expect(h).toHaveTextContent("Step 2 of 4");
});

test("SectionLayout with evidence is a two-child split", () => {
  const { container } = render(
    <SectionLayout prose={<p>p</p>} evidence={<p>e</p>} />,
  );
  const split = container.querySelector(".methodology-section--split");
  expect(split).not.toBeNull();
  expect(split?.children).toHaveLength(2);
});

test("SectionLayout without evidence is one column", () => {
  const { container } = render(<SectionLayout prose={<p>p</p>} />);
  expect(container.querySelector(".methodology-section--split")).toBeNull();
  expect(
    container.querySelector(".methodology-section")?.children,
  ).toHaveLength(1);
});
