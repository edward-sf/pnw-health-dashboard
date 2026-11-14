import { render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { STORAGE_KEY } from "../theme/theme";
import { ThemeProvider } from "../theme/ThemeProvider";
import { HatchSwatch } from "./HatchSwatch";
import { PALETTES } from "./palette";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

test("draws a hidden 16x16 swatch filled with its own hatch pattern", () => {
  const { container } = render(<HatchSwatch />);
  const svg = container.querySelector("svg.legend-swatch")!;
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("width", "16");
  const id = svg.querySelector("pattern")!.id;
  expect(svg.querySelector(":scope > rect")).toHaveAttribute("fill", `url(#${id})`);
  expect(svg.querySelector("pattern rect")).toHaveAttribute("fill", PALETTES.light.hatchBackground);
  expect(svg.querySelector("pattern line")).toHaveAttribute("stroke", PALETTES.light.hatchLine);
});

test("takes the dark palette's hatch in the dark theme", () => {
  localStorage.setItem(STORAGE_KEY, "dark");
  const { container } = render(
    <ThemeProvider>
      <HatchSwatch />
    </ThemeProvider>,
  );
  expect(container.querySelector("pattern rect")).toHaveAttribute("fill", PALETTES.dark.hatchBackground);
  expect(container.querySelector("pattern line")).toHaveAttribute("stroke", PALETTES.dark.hatchLine);
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
