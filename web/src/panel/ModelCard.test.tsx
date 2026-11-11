import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { manifest, model } from "../test/fixtures";
import type { CountyModel, Flag } from "../types";
import { ModelCard } from "./ModelCard";
import { rangeDomain } from "./ResidualRange";

const king = { fips: "53033", name: "King", state: "WA" };

function renderCard(entry: CountyModel, county = king) {
  return render(
    <MemoryRouter>
      <ModelCard county={county} entry={entry} indicators={manifest.indicators} />
    </MemoryRouter>,
  );
}

test("King: comparison, badge, range sentence and factors", () => {
  renderCard(model.counties["53033"]!);
  expect(screen.getByRole("heading", { level: 3, name: "Life expectancy model" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 4, name: "How this county compares" })).toBeInTheDocument();
  expect(screen.getByText("Actual 80.8 years")).toBeInTheDocument();
  expect(screen.getByText("Expected 77.1 years")).toBeInTheDocument();
  expect(screen.getByText("Difference +3.7 years")).toBeInTheDocument();
  expect(screen.getByText("Notably better than expected")).toBeInTheDocument();
  expect(
    screen.getByText(
      "A difference beyond ±2.4 years is flagged as somewhat better or worse, and beyond ±3.4 years as notably. These ranges allow for the model's typical error and this county's own measurement uncertainty.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 4, name: "Factors associated with the expected value" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/starting point of 75\.0 to 77\.1 years\. They describe what the model expects/),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/All other factors/).length).toBeGreaterThan(0);
});

test("null se uses the typical-county wording", () => {
  renderCard(model.counties["16001"]!, { fips: "16001", name: "Ada", state: "ID" });
  expect(
    screen.getByText(
      /and a typical county's measurement uncertainty, since this county's estimate has no confidence interval\.$/,
    ),
  ).toBeInTheDocument();
});

test("no model result", () => {
  renderCard(model.counties["02063"]!, { fips: "02063", name: "Chugach", state: "AK" });
  expect(
    screen.getByText(
      /The model has no result for this county because its life expectancy isn't reported\./,
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute("href", "/methodology");
  expect(screen.queryByText(/Factors associated/)).not.toBeInTheDocument();
});

test("rangeDomain covers the residual and pads the thresholds", () => {
  expect(rangeDomain(11.8, 3.37)).toBeGreaterThanOrEqual(11.8);
  expect(rangeDomain(1, 3.37)).toBe(3.37 * 1.15);
});

test("wording guard: no driver, cause or because of in any tier", () => {
  const base = model.counties["53033"]!;
  const flags: Flag[] = [
    "notably_worse",
    "somewhat_worse",
    "none",
    "somewhat_better",
    "notably_better",
    "insufficient_data",
  ];
  for (const flag of flags) {
    const entry: CountyModel =
      flag === "insufficient_data" ? model.counties["02063"]! : { ...base, flag };
    const { container, unmount } = renderCard(entry);
    expect(container.textContent).not.toMatch(/\bdrivers?\b|\bcause[sd]?\b|because of/i);
    unmount();
  }
});

test("the factors section draws neutral bars and never uses a tier colour", () => {
  const { container } = renderCard(model.counties["53033"]!);
  const factors = container.querySelector(".model-factors")!;
  const rects = factors.querySelectorAll("rect.shap-bar");
  expect(rects.length).toBeGreaterThan(0);
  for (const r of rects) expect(r.getAttribute("fill")).toBe("#6b7280");
  const tiers = ["#ca0020", "#f4a582", "#e3e3e3", "#92c5de", "#0571b0"];
  for (const el of [factors, ...factors.querySelectorAll("*")]) {
    const used = ["style", "fill", "stroke"]
      .map((a) => (el.getAttribute(a) ?? "").toLowerCase())
      .join(" ");
    for (const t of tiers) expect(used).not.toContain(t);
  }
});
