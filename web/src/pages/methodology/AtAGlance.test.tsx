import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  lifeExpectancy as target,
  manifest,
  model,
  topology,
  values,
} from "../../test/fixtures";
import { AtAGlance } from "./AtAGlance";

const data = { manifest, model, topology, values };

test("summarizes coverage, accuracy and the top factors", () => {
  render(<AtAGlance data={data} />);
  expect(
    screen.getByRole("heading", { name: "At a glance" }),
  ).toBeInTheDocument();
  const text = document.body.textContent ?? "";
  expect(text).toContain("0.70");
  expect(text).toContain("0.80");
  expect(text).toMatch(
    /fits the national pattern better than the Pacific Northwest/,
  );
  expect(text).toContain(
    "Bachelor's degree or higher, Poverty rate and Median household income",
  );
  expect(text).not.toContain("unemployment_rate");
  expect(text).toContain(
    `${target.model_card.features.length} social and economic factors`,
  );
});

test("doesn't claim a worse PNW fit when the PNW R² is not lower", () => {
  const better = {
    ...target,
    metrics: {
      ...target.metrics,
      lightgbm: {
        ...target.metrics.lightgbm,
        pnw: { ...target.metrics.lightgbm.pnw, r2: 0.9 },
      },
    },
  };
  render(
    <AtAGlance
      data={{
        ...data,
        model: { ...data.model, targets: { life_expectancy: better } },
      }}
    />,
  );
  expect(document.body.textContent).not.toMatch(
    /better than the Pacific Northwest/,
  );
});

test("the closing line holds for every outcome", () => {
  render(<AtAGlance data={data} />);
  expect(document.body.textContent).not.toMatch(/longer or shorter lives/);
});
