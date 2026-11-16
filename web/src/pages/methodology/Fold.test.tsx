import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Fold } from "./Fold";

test("is closed by default, with its children in the DOM", () => {
  render(
    <Fold summary="Show all 3 things">
      <p>Hidden detail</p>
    </Fold>,
  );
  const summary = screen.getByText("Show all 3 things");
  const details = summary.closest("details")!;
  expect(details).toHaveClass("methodology-fold");
  expect(details).not.toHaveAttribute("open");
  expect(details).toContainElement(screen.getByText("Hidden detail"));
});
