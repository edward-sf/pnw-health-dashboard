import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { CountySearch } from "./CountySearch";

const counties = [
  { fips: "53033", name: "King County", state: "WA" },
  { fips: "41051", name: "Multnomah County", state: "OR" },
  { fips: "41067", name: "Washington County", state: "OR" },
  { fips: "16087", name: "Washington County", state: "ID" },
  { fips: "02016", name: "Aleutians West Census Area", state: "AK" },
];

const listeners: Array<(e: KeyboardEvent) => void> = [];
function spyOnKeydown(seen: boolean[]) {
  const l = (e: KeyboardEvent) => seen.push(e.defaultPrevented);
  document.addEventListener("keydown", l);
  listeners.push(l);
}
afterEach(() => {
  for (const l of listeners.splice(0)) document.removeEventListener("keydown", l);
});

function setup() {
  const onSelect = vi.fn();
  render(<CountySearch counties={counties} onSelect={onSelect} />);
  return { onSelect, input: screen.getByRole("combobox", { name: "Search counties" }) };
}

test("filters by name, case-insensitively", async () => {
  const { input } = setup();
  await userEvent.type(input, "kING");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["King County, WA"]);
  expect(input).toHaveAttribute("aria-expanded", "true");
});

test("filters by state", async () => {
  const { input } = setup();
  await userEvent.type(input, ", id");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Washington County, ID"]);
});

test("shows at most 8 options", async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ fips: `0${1000 + i}`, name: `X${i} County`, state: "WA" }));
  render(<CountySearch counties={many} onSelect={vi.fn()} />);
  await userEvent.type(screen.getByRole("combobox"), "x");
  expect(screen.getAllByRole("option")).toHaveLength(8);
});

test("same-named counties select their own FIPS", async () => {
  const { input, onSelect } = setup();
  await userEvent.type(input, "Washington");
  expect(screen.getAllByRole("option").slice(0, 2).map((o) => o.textContent)).toEqual([
    "Washington County, OR",
    "Washington County, ID",
  ]);
  await userEvent.click(screen.getByRole("option", { name: "Washington County, ID" }));
  expect(onSelect).toHaveBeenCalledWith("16087", input);
});

test("ArrowDown then Enter selects the first match", async () => {
  const { input, onSelect } = setup();
  await userEvent.type(input, "Washington");
  await userEvent.keyboard("{ArrowDown}");
  expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]!.id);
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("41067", input);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("Escape closes an open list and prevents default so the panel stays", async () => {
  const { input } = setup();
  await userEvent.type(input, "king");
  const seen: boolean[] = [];
  spyOnKeydown(seen);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(seen).toEqual([true]);
});

test("Escape with the list closed is not prevented", async () => {
  const { input } = setup();
  input.focus();
  const seen: boolean[] = [];
  spyOnKeydown(seen);
  await userEvent.keyboard("{Escape}");
  expect(seen).toEqual([false]);
});

test("Enter with no highlighted option selects the first match", async () => {
  const { input, onSelect } = setup();
  await userEvent.type(input, "Multnomah{Enter}");
  expect(onSelect).toHaveBeenCalledWith("41051", input);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("Enter with no matches selects nothing", async () => {
  const { input, onSelect } = setup();
  await userEvent.type(input, "zzz{Enter}");
  expect(onSelect).not.toHaveBeenCalled();
});

test("filters by full state name", async () => {
  const { input } = setup();
  await userEvent.type(input, "oregon");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Multnomah County, OR",
    "Washington County, OR",
  ]);
});

test("matches a county and full state name together", async () => {
  const { input } = setup();
  await userEvent.type(input, "king county, wash");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["King County, WA"]);
});

test("counties named for a state rank above counties in that state", async () => {
  const many = [
    ...Array.from({ length: 10 }, (_, i) => ({ fips: `5300${i}`, name: `X${i} County`, state: "WA" })),
    { fips: "41067", name: "Washington County", state: "OR" },
  ];
  render(<CountySearch counties={many} onSelect={vi.fn()} />);
  await userEvent.type(screen.getByRole("combobox"), "washington");
  expect(screen.getAllByRole("option")[0]).toHaveTextContent("Washington County, OR");
  expect(screen.getAllByRole("option")).toHaveLength(8);
});

test("announces when nothing matches", async () => {
  const { input } = setup();
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  await userEvent.type(input, "zzz");
  expect(screen.getByRole("status")).toHaveTextContent("No matching counties");
  await userEvent.clear(input);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("aria-controls is absent while the listbox is closed and points at it when open", async () => {
  const { input } = setup();
  expect(input).not.toHaveAttribute("aria-controls");
  await userEvent.type(input, "king");
  expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
});
