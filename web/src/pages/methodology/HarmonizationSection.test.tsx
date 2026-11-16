import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest } from "../../test/fixtures";
import { HarmonizationSection } from "./HarmonizationSection";

const coverage = {
  counties: 149,
  states: ["Alaska", "Idaho", "Oregon", "Washington"],
};

test("names the counties and the four states the site covers", () => {
  render(<HarmonizationSection sources={manifest.sources} coverage={coverage} />);
  expect(document.body.textContent).toContain(
    "149 counties in Alaska, Idaho, Oregon and Washington",
  );
});

test("covers FIPS, the Kusilvak remap and the Valdez-Cordova legacy values", () => {
  render(<HarmonizationSection sources={manifest.sources} coverage={coverage} />);
  expect(
    screen.getByRole("heading", { level: 4, name: "Geography" }),
  ).toHaveAttribute("id", "harmonization");
  const legacy = screen.getByRole("heading", {
    level: 5,
    name: /Valdez-Cordova/,
  });
  expect(legacy).toHaveAttribute("id", "legacy");
  expect(legacy).toHaveAttribute("tabindex", "-1");
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/Wade Hampton/);
  expect(text).toMatch(/Kusilvak/);
  expect(text).toMatch(/Chugach/);
  expect(text).toMatch(/Copper River/);
  expect(text).toContain("County Health Rankings & Roadmaps 2023");
  expect(text).toMatch(/left out of ranks and out of model training/);
});

test("omits the legacy vintage when the manifest has no older CHR release", () => {
  render(
    <HarmonizationSection
      sources={[{ source: "chr", year: 2025, url: "u" }]}
      coverage={coverage}
    />,
  );
  expect(document.body.textContent).not.toMatch(/Roadmaps \d{4}/);
  expect(document.body.textContent).not.toContain("undefined");
});
