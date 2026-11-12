import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { OutcomePicker } from "./OutcomePicker";

const targets = [
  { id: "life_expectancy", label: "Life expectancy" },
  { id: "premature_death", label: "Premature death (years lost)" },
];

test("is a labelled select listing the targets with the value selected", () => {
  render(<OutcomePicker targets={targets} value="premature_death" onChange={() => {}} />);
  const select = screen.getByRole("combobox", { name: "Outcome" });
  expect(select).toHaveValue("premature_death");
  expect(screen.getAllByRole("option")).toHaveLength(2);
});

test("calls onChange with the chosen id", async () => {
  const onChange = vi.fn();
  render(<OutcomePicker targets={targets} value="life_expectancy" onChange={onChange} />);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Outcome" }), "premature_death");
  expect(onChange).toHaveBeenCalledWith("premature_death");
});
