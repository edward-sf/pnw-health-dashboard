import { expect, test } from "vitest";
import { manifest, model, strata, topology, values } from "../../test/fixtures";
import { defaultTargetId, targetModel } from "../../model/targetView";
import { pipelineFigures } from "./pipelineFigures";

const data = { manifest, model, strata, topology, values };

test("counts sources, counties and outcomes, and reads the default PNW R²", () => {
  const f = pipelineFigures(data);
  const fips = topology.objects.counties.geometries.filter(
    (g) => g.properties && "fips" in g.properties,
  );
  expect(f.sources).toBe(new Set(manifest.sources.map((s) => s.source)).size);
  expect(f.sources).toBe(4);
  expect(f.counties).toBe(fips.length);
  expect(f.pnwR2).toBe(
    targetModel(model, defaultTargetId(Object.keys(model.targets))).metrics
      .lightgbm.pnw.r2,
  );
  expect(f.outcomes).toBe(Object.keys(model.targets).length);
});
