import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import type { DataState } from "../data/useData";
import { manifest, model, topology, values } from "../test/fixtures";
import { Methodology } from "./Methodology";

const ready: DataState = {
  status: "ready",
  data: { manifest, model, topology, values },
};

const ANCHORS = [
  "sources",
  "indicators",
  "harmonization",
  "legacy",
  "missing-data",
  "suppression",
  "unreliable",
  "model",
  "exclusions",
  "similar-counties",
  "model-card",
];

function at(state: DataState, path = "/methodology") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Methodology state={state} />
    </MemoryRouter>,
  );
}

test("loading shows the loading line", () => {
  at({ status: "loading" });
  expect(screen.getByRole("heading", { level: 2, name: "Methodology" })).toBeInTheDocument();
  expect(screen.getByText("Loading data…")).toBeInTheDocument();
});

test("error shows the error page and retries", async () => {
  const retry = vi.fn();
  at({ status: "error", message: "boom", retry });
  expect(screen.getByRole("heading", { name: "Couldn't load the data" })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("ready renders every anchor, focusable, with a table of contents", () => {
  at(ready);
  for (const id of ANCHORS) {
    const el = document.getElementById(id);
    expect(el, id).not.toBeNull();
    expect(el).toHaveAttribute("tabindex", "-1");
  }
  const toc = screen.getByRole("navigation", { name: "On this page" });
  expect(toc.querySelectorAll("a").length).toBeGreaterThanOrEqual(6);
  expect(screen.getByRole("link", { name: "Sources and vintages" })).toHaveAttribute(
    "href",
    "/methodology#sources",
  );
  expect(screen.getByRole("heading", { name: "At a glance" })).toBeInTheDocument();
});

test("a deep link opened before the data loads focuses its heading once ready", () => {
  const { rerender } = at({ status: "loading" }, "/methodology#legacy");
  expect(screen.getByText("Loading data…")).toBeInTheDocument();
  rerender(
    <MemoryRouter initialEntries={["/methodology#legacy"]}>
      <Methodology state={ready} />
    </MemoryRouter>,
  );
  expect(document.getElementById("legacy")).toHaveFocus();
});

test("wording guard: no causal language anywhere on the page", () => {
  at(ready);
  expect(document.body.textContent).not.toMatch(/\b(caus(e|es|ed)|driv(e|es|er|ers))\b/i);
  expect(document.body.textContent).not.toMatch(/explains? the difference/i);
});

test("the outline nests: one page h2, sections at h3, sub-anchors at h4", () => {
  at(ready);
  const h2s = screen.getAllByRole("heading", { level: 2 });
  expect(h2s.map((h) => h.textContent)).toEqual(["Methodology"]);
  expect(h2s[0]).toHaveAttribute("data-page-heading");
  for (const id of [
    "at-a-glance",
    "sources",
    "indicators",
    "harmonization",
    "missing-data",
    "model",
    "exclusions",
    "model-card",
  ]) {
    expect(document.getElementById(id)?.tagName, id).toBe("H3");
  }
  for (const id of ["legacy", "suppression", "unreliable"]) {
    expect(document.getElementById(id)?.tagName, id).toBe("H4");
  }
});

test("the outcome select lives on the page, defaults to life expectancy and drives importance and the model card", async () => {
  at(ready);
  const select = screen.getByRole("combobox", { name: "Outcome" });
  expect(select).toHaveValue("life_expectancy");
  expect(
    screen.getByRole("heading", { level: 4, name: /Factors by importance/ }),
  ).toHaveTextContent("Life expectancy");
  await userEvent.setup().selectOptions(select, "premature_death");
  expect(
    screen.getByRole("heading", { level: 4, name: /Factors by importance/ }),
  ).toHaveTextContent("Premature death");
  expect(document.body.textContent).toContain("OutcomePremature death");
});

test("has a Similar counties section in the table of contents", () => {
  at(ready);
  expect(screen.getByRole("link", { name: "Similar counties" })).toHaveAttribute(
    "href",
    "/methodology#similar-counties",
  );
  expect(document.getElementById("similar-counties")?.tagName).toBe("H3");
});
