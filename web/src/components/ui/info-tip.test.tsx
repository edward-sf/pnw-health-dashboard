import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { InfoTip } from "./info-tip";

test("InfoTip is a named button that reveals its content", async () => {
  render(
    <InfoTip label="About this measure">
      <p>Details</p>
    </InfoTip>,
  );
  expect(screen.queryByText("Details")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "About this measure" }));
  expect(await screen.findByText("Details")).toBeVisible();
});

test("InfoTip passes its class to the button", () => {
  render(
    <InfoTip label="About" className="about-measure">
      <p>Details</p>
    </InfoTip>,
  );
  expect(screen.getByRole("button", { name: "About" })).toHaveClass("about-measure");
});
