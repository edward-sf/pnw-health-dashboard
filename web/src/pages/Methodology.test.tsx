import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import type { DataState } from "../data/useData";
import { mockMatchMedia } from "../test/matchMedia";
import { manifest, model, strata, topology, values } from "../test/fixtures";
import { Methodology } from "./Methodology";
import { STEPS } from "./methodology/steps";

const ready: DataState = {
  status: "ready",
  data: { manifest, model, strata, topology, values },
};

const ANCHORS = [
  "sources",
  "indicators",
  "harmonization",
  "legacy",
  "missing-data",
  "suppression",
  "unreliable",
  "race-breakdown",
  "model",
  "model-importance",
  "no-result",
  "exclusions",
  "similar-counties",
  "model-card",
  "fetch",
  "harmonize",
  "model-step",
  "publish",
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
  expect(
    screen.getByRole("heading", { level: 2, name: "How the atlas is built" }),
  ).toBeInTheDocument();
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
    if (id !== "model-importance") expect(el).toHaveAttribute("tabindex", "-1");
  }
  const toc = screen.getByRole("navigation", { name: "On this page" });
  expect(toc.querySelectorAll("a").length).toBeGreaterThanOrEqual(6);
  expect(screen.getByRole("link", { name: "Sources and vintages" })).toHaveAttribute(
    "href",
    "#sources",
  );
  expect(document.querySelector(".methodology-toc")).toBeNull();
  expect(screen.queryByText("At a glance")).toBeNull();
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
  // "Associations, not causes." negates causation, so it is the one allowed use of the word.
  const text = (document.body.textContent ?? "").replace("Associations, not causes.", "");
  expect(text).not.toMatch(/\b(caus(e|es|ed)|driv(e|es|er|ers))\b/i);
  expect(text).not.toMatch(/explains? the difference/i);
});

test("the outline nests: page h2, steps at h3, sections at h4, sub-anchors at h5", () => {
  at(ready);
  const h2s = screen.getAllByRole("heading", { level: 2 });
  expect(h2s.map((h) => h.textContent)).toEqual(["How the atlas is built"]);
  expect(h2s[0]).toHaveAttribute("data-page-heading");
  for (const id of [
    "sources",
    "indicators",
    "harmonization",
    "missing-data",
    "race-breakdown",
    "model",
    "exclusions",
    "similar-counties",
    "model-card",
  ]) {
    expect(document.getElementById(id)?.tagName, id).toBe("H4");
  }
  for (const id of ["legacy", "suppression", "unreliable", "model-importance", "no-result"]) {
    expect(document.getElementById(id)?.tagName, id).toBe("H5");
  }
  expect(screen.getByRole("heading", { level: 4, name: "How it works" })).toHaveAttribute(
    "id",
    "model",
  );
});

test("each step has an h3 with its id and 'Step n of 4', and contains its sections", () => {
  at(ready);
  STEPS.forEach((step, i) => {
    const h = screen.getByRole("heading", { level: 3, name: new RegExp(step.name) });
    expect(h).toHaveAttribute("id", step.id);
    expect(h).toHaveTextContent(`Step ${i + 1} of 4`);
    const stepEl = h.closest("section");
    for (const { id } of step.sections) {
      expect(stepEl?.contains(document.getElementById(id)), id).toBe(true);
    }
  });
});

test("the outcome select lives on the page, defaults to life expectancy and drives importance and the model card", async () => {
  at(ready);
  const select = screen.getByRole("combobox", { name: "Outcome" });
  expect(select).toHaveTextContent("Life expectancy");
  expect(
    screen.getByRole("heading", { level: 5, name: /Factors by importance/ }),
  ).toHaveTextContent("Life expectancy");
  const user = userEvent.setup();
  await user.click(select);
  await user.click(screen.getByRole("option", { name: "Premature death (years lost)" }));
  expect(
    screen.getByRole("heading", { level: 5, name: /Factors by importance/ }),
  ).toHaveTextContent("Premature death");
  expect(document.body.textContent).toContain("OutcomePremature death");
});

test("has a Similar counties section in the table of contents", () => {
  at(ready);
  expect(screen.getByRole("link", { name: "Similar counties" })).toHaveAttribute(
    "href",
    "#similar-counties",
  );
  expect(document.getElementById("similar-counties")?.tagName).toBe("H4");
});

test("a deep link to similar counties focuses its heading", () => {
  at(ready, "/methodology#similar-counties");
  expect(document.getElementById("similar-counties")).toHaveFocus();
});

test("falls back to the first target when life_expectancy is absent", () => {
  const rest = Object.fromEntries(
    Object.entries(model.targets).filter(([id]) => id !== "life_expectancy"),
  );
  const without: DataState = {
    status: "ready",
    data: { manifest, topology, values, strata, model: { ...model, targets: rest } },
  };
  at(without);
  expect(screen.getByRole("heading", { name: "How the atlas is built" })).toBeInTheDocument();
  expect(screen.getByText(/The default is premature death\./)).toBeInTheDocument();
});

test("clicking a rail link moves focus to its heading", async () => {
  at(ready);
  await userEvent.setup().click(screen.getByRole("link", { name: "Indicators" }));
  expect(document.getElementById("indicators")).toHaveFocus();
});

test("scrolls smoothly, or instantly when the reader prefers reduced motion", async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  try {
    at(ready, "/methodology#indicators");
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth" });
    cleanup();
    mockMatchMedia(true);
    at(ready, "/methodology#indicators");
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "auto" });
  } finally {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  }
});
