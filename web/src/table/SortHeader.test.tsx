import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SortHeader } from "./SortHeader";
import type { SortDir } from "./sortRows";

type Key = "name" | "value";

function setup(sort: { key: Key; dir: SortDir }) {
  const onSort = vi.fn();
  render(
    <table>
      <thead>
        <tr>
          <SortHeader sortKey="name" label="County" sort={sort} onSort={onSort} />
          <SortHeader sortKey="value" label="Value" sort={sort} onSort={onSort} />
        </tr>
      </thead>
    </table>,
  );
  return onSort;
}
const header = (name: string) => screen.getByRole("columnheader", { name });

test("aria-sort reflects the active key and direction", () => {
  setup({ key: "name", dir: "asc" });
  expect(header("County")).toHaveAttribute("aria-sort", "ascending");
  expect(header("Value")).toHaveAttribute("aria-sort", "none");
});

test("aria-sort is descending for a descending sort", () => {
  setup({ key: "value", dir: "desc" });
  expect(header("Value")).toHaveAttribute("aria-sort", "descending");
});

test("clicking the active header flips its direction", async () => {
  const onSort = setup({ key: "name", dir: "asc" });
  await userEvent.click(screen.getByRole("button", { name: "County" }));
  expect(onSort).toHaveBeenCalledWith({ key: "name", dir: "desc" });
});

test("clicking another header sorts by it ascending", async () => {
  const onSort = setup({ key: "name", dir: "desc" });
  await userEvent.click(screen.getByRole("button", { name: "Value" }));
  expect(onSort).toHaveBeenCalledWith({ key: "value", dir: "asc" });
});
