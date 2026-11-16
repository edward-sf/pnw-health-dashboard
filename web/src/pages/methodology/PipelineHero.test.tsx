import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import {
  lifeExpectancy as target,
  manifest,
  model,
  strata,
  topology,
  values,
} from "../../test/fixtures";
import { formatMetric } from "./format";
import { PipelineHero } from "./PipelineHero";

const data = { manifest, model, strata, topology, values };
const counties = topology.objects.counties.geometries.filter(
  (g) => g.properties && "fips" in g.properties,
).length;

const show = (d = data) =>
  render(
    <MemoryRouter>
      <PipelineHero data={d} />
    </MemoryRouter>,
  );

test("states the lede with the topology's county count", () => {
  show();
  expect(
    screen.getByText(
      `Public data for every US county, narrowed to ${counties} in the Pacific Northwest, and a model tested on states it never saw.`,
    ),
  ).toBeInTheDocument();
});

test("the strip links to the four step headings with figure and label", () => {
  show();
  const nav = screen.getByRole("navigation", { name: "Pipeline steps" });
  const links = within(nav).getAllByRole("link");
  expect(links.map((l) => l.getAttribute("href"))).toEqual([
    "/#fetch",
    "/#harmonize",
    "/#model-step",
    "/#publish",
  ]);
  const pnw = formatMetric(target.metrics.lightgbm.pnw.r2);
  expect(links[0]).toHaveTextContent("4public sources");
  expect(links[1]).toHaveTextContent(`${counties}counties`);
  expect(links[2]).toHaveTextContent(`${pnw}R² in the region`);
  expect(links[3]).toHaveTextContent("5data files");
  expect(links[0]).toHaveTextContent(
    "ACS, CDC PLACES, County Health Rankings, boundaries",
  );
  expect(links[1]).toHaveTextContent(
    "Boundary changes, missing and uncertain values",
  );
  expect(links[2]).toHaveTextContent(
    `${Object.keys(model.targets).length} outcomes, cross-validated by state`,
  );
  expect(links[3]).toHaveTextContent("Checked against a schema, rebuilt by CI");
});

test("the hero shows the PNW R² even when it is not lower than the national one", () => {
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
  show({
    ...data,
    model: { ...data.model, targets: { life_expectancy: better } },
  });
  expect(
    screen.getByRole("navigation", { name: "Pipeline steps" }),
  ).toHaveTextContent("0.90");
});
