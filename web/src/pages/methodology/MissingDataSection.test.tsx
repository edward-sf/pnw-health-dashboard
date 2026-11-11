import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest } from "../../test/fixtures";
import { MissingDataSection } from "./MissingDataSection";

test("suppression, unreliable estimates and confidence levels", () => {
  render(<MissingDataSection indicators={manifest.indicators} />);
  expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute("id", "missing-data");
  expect(screen.getByRole("heading", { level: 4, name: /Suppressed/ })).toHaveAttribute(
    "id",
    "suppression",
  );
  expect(screen.getByRole("heading", { level: 4, name: /Unreliable/ })).toHaveAttribute(
    "id",
    "unreliable",
  );
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/never filled in/);
  expect(text).toMatch(/keep their value and rank/);
  expect(text).toMatch(/margins of error at the 90% level/);
  expect(text).toMatch(/95%/);
});
