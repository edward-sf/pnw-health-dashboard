import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest, model } from "../../test/fixtures";
import { PeersSection } from "./PeersSection";

const { peers } = model;

test("the heading is the focusable id the panel links to", () => {
  render(<PeersSection peers={peers} indicators={manifest.indicators} />);
  const heading = screen.getByRole("heading", {
    level: 3,
    name: "Similar counties",
  });
  expect(heading).toHaveAttribute("id", "similar-counties");
  expect(heading).toHaveAttribute("tabindex", "-1");
});

test("names k, the minimum features, imputation, scaling, distance and the race exclusion", () => {
  const real = {
    method: {
      ...peers.method,
      k: 5,
      min_features: 6,
      features: peers.method.features.concat(Array(6).fill("x")),
    },
    counties: peers.counties,
  };
  render(<PeersSection peers={real} indicators={manifest.indicators} />);
  const text = document.body.textContent ?? "";
  expect(text).toContain("5 nearest");
  expect(text).toContain("at least 6 of the 9 factors");
  expect(text).toMatch(/median/);
  expect(text).toMatch(/z-scores/);
  expect(text).toMatch(/Euclidean/);
  expect(text).toContain(`${Object.keys(peers.counties).length} Pacific Northwest counties`);
  expect(text).toMatch(/race and ethnicity/i);
  expect(text).toMatch(/never a county outside the Pacific Northwest/i);
  expect(text).not.toMatch(/\b(caus(e|es|ed)|driv(e|es|er|ers))\b/i);
});

test("reads k, the minimum and the feature list from the method, not from constants", () => {
  render(<PeersSection peers={peers} indicators={manifest.indicators} />);
  const text = document.body.textContent ?? "";
  expect(text).toContain(`${peers.method.k} nearest`);
  expect(text).toContain(
    `at least ${peers.method.min_features} of the ${peers.method.features.length} factors`,
  );
  expect(text).toContain("Poverty rate");
});
