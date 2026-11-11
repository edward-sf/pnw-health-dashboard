import { render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { usePageTitle } from "./usePageTitle";

function Page({ title }: { title: string }) {
  usePageTitle(title);
  return null;
}

afterEach(() => {
  document.title = "";
});

test("sets document.title", () => {
  render(<Page title="About · PNW Health Dashboard" />);
  expect(document.title).toBe("About · PNW Health Dashboard");
});

test("updates document.title when the title changes", () => {
  const { rerender } = render(<Page title="PNW Health Dashboard" />);
  rerender(<Page title="Methodology · PNW Health Dashboard" />);
  expect(document.title).toBe("Methodology · PNW Health Dashboard");
});
