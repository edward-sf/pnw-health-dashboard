import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

function Group() {
  const [value, setValue] = useState("a");
  return (
    <ToggleGroup type="single" aria-label="Choice" value={value} onValueChange={(v) => v && setValue(v)}>
      <ToggleGroupItem value="a">Alpha</ToggleGroupItem>
      <ToggleGroupItem value="b">Beta</ToggleGroupItem>
      <ToggleGroupItem value="c">Gamma</ToggleGroupItem>
    </ToggleGroup>
  );
}

test("arrow keys move focus and select, like a radio group", async () => {
  const user = userEvent.setup();
  render(<Group />);
  await user.tab();
  expect(screen.getByRole("radio", { name: "Alpha" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
  expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
  await user.keyboard("{ArrowRight}{ArrowLeft}");
  expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
  await user.keyboard("{End}");
  expect(screen.getByRole("radio", { name: "Gamma" })).toBeChecked();
});

test("tabbing into the group does not change the selection", async () => {
  const user = userEvent.setup();
  render(
    <>
      <button>before</button>
      <Group />
    </>,
  );
  await user.tab();
  await user.tab();
  expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
});
