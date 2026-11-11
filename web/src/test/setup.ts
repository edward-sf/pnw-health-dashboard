import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetMatchMedia } from "./matchMedia";

vi.mock("@observablehq/plot", () => ({
  plot: () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
  dot: () => ({}),
}));

afterEach(() => {
  cleanup();
  resetMatchMedia();
});
