import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetMatchMedia } from "./matchMedia";

vi.mock("@observablehq/plot", () => ({
  plot: () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
  dot: () => ({}),
}));

// jsdom lacks these; Radix Popover, cmdk and the Explorer's stage measurement use them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
// Radix Select and vaul capture the pointer on press.
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false;
};
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};

afterEach(() => {
  cleanup();
  resetMatchMedia();
});
