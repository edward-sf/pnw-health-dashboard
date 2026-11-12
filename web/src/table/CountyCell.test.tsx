import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CountyCell } from "./CountyCell";

function setup(selected: boolean) {
  const onSelect = vi.fn();
  render(
    <table>
      <tbody>
        <tr>
          <CountyCell fips="53033" name="King" state="WA" selected={selected} onSelect={onSelect} />
        </tr>
      </tbody>
    </table>,
  );
  return onSelect;
}

test("the button names the county and state and passes its FIPS and itself", async () => {
  const onSelect = setup(false);
  const button = screen.getByRole("button", { name: "King, WA" });
  expect(button).toHaveTextContent("King");
  await userEvent.click(button);
  expect(onSelect).toHaveBeenCalledWith("53033", button);
});

test("aria-current is set only when selected", () => {
  setup(true);
  expect(screen.getByRole("button", { name: "King, WA" })).toHaveAttribute("aria-current", "true");
});

test("an unselected cell has no aria-current", () => {
  setup(false);
  expect(screen.getByRole("button", { name: "King, WA" })).not.toHaveAttribute("aria-current");
});
