import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { HatchSwatch } from "./HatchSwatch";
import { HATCH_BACKGROUND } from "./makeColorScale";

test("draws a hidden 16x16 swatch filled with its own hatch pattern", () => {
  const { container } = render(<HatchSwatch />);
  const svg = container.querySelector("svg.legend-swatch")!;
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("width", "16");
  const id = svg.querySelector("pattern")!.id;
  expect(svg.querySelector(":scope > rect")).toHaveAttribute("fill", `url(#${id})`);
  expect(svg.querySelector("pattern rect")).toHaveAttribute("fill", HATCH_BACKGROUND);
  expect(svg.querySelector("pattern line")).toHaveAttribute("stroke", "#999");
});

test("two swatches on one page each use their own pattern", () => {
  const { container } = render(
    <>
      <HatchSwatch />
      <HatchSwatch />
    </>,
  );
  const svgs = [...container.querySelectorAll("svg")];
  const ids = svgs.map((s) => s.querySelector("pattern")!.id);
  expect(new Set(ids).size).toBe(2);
  svgs.forEach((s, i) =>
    expect(s.querySelector(":scope > rect")).toHaveAttribute("fill", `url(#${ids[i]})`),
  );
});
