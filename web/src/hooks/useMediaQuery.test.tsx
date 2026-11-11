import { act, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { mockMatchMedia } from "../test/matchMedia";
import { PHONE_QUERY, useMediaQuery } from "./useMediaQuery";

function Probe() {
  return <p>{useMediaQuery(PHONE_QUERY) ? "phone" : "wide"}</p>;
}

test("PHONE_QUERY is the 720px breakpoint", () => {
  expect(PHONE_QUERY).toBe("(max-width: 720px)");
});

test("the initial value follows matchMedia", () => {
  mockMatchMedia(true);
  render(<Probe />);
  expect(screen.getByText("phone")).toBeInTheDocument();
});

test("a change event rerenders with the new value", () => {
  const mm = mockMatchMedia(false);
  render(<Probe />);
  expect(screen.getByText("wide")).toBeInTheDocument();
  act(() => mm.set(true));
  expect(screen.getByText("phone")).toBeInTheDocument();
});

test("without matchMedia it returns false", () => {
  expect(window.matchMedia).toBeUndefined();
  render(<Probe />);
  expect(screen.getByText("wide")).toBeInTheDocument();
});
