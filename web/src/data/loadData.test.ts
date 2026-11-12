import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { manifest, model, topology, values } from "../test/fixtures";
import { loadData, SUPPORTED_SCHEMA_MAJOR } from "./loadData";

const bodies: Record<string, unknown> = {
  "manifest.json": manifest,
  "values.json": values,
  "counties.topojson": topology,
  "model.json": model,
};

let fetched: string[];

function stubFetch(overrides: Record<string, Response | unknown> = {}) {
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      const name = url.split("/").pop() as string;
      const o = overrides[name];
      if (o instanceof Response) return o;
      return new Response(JSON.stringify(o ?? bodies[name]), { status: 200 });
    }),
  );
}

beforeEach(() => stubFetch());
afterEach(() => vi.unstubAllGlobals());

describe("loadData", () => {
  it("requests every file under the base path", async () => {
    await loadData("/pnw-health-dashboard/");
    expect(fetched).toEqual(
      expect.arrayContaining([
        "/pnw-health-dashboard/data/manifest.json",
        "/pnw-health-dashboard/data/values.json",
        "/pnw-health-dashboard/data/counties.topojson",
      ]),
    );
  });

  it("fetches model.json with the other files", async () => {
    const data = await loadData("/pnw-health-dashboard/");
    expect(fetched).toContain("/pnw-health-dashboard/data/model.json");
    expect(data.model).toEqual(model);
  });

  it("rejects when model.json fails", async () => {
    stubFetch({ "model.json": new Response("nope", { status: 404 }) });
    await expect(loadData("/")).rejects.toThrow(/model\.json/);
  });

  it("returns the parsed files", async () => {
    const data = await loadData("/");
    expect(data.manifest).toEqual(manifest);
    expect(data.values).toEqual(values);
    expect(data.topology).toEqual(topology);
  });

  it("rejects a non-OK response", async () => {
    stubFetch({ "values.json": new Response("nope", { status: 404 }) });
    await expect(loadData("/")).rejects.toThrow(/values\.json/);
  });

  it("rejects an older schema major", async () => {
    stubFetch({ "manifest.json": { ...manifest, schema_version: "1.3.0" } });
    await expect(loadData("/")).rejects.toThrow(/schema/i);
  });

  it("rejects a newer schema major", async () => {
    stubFetch({ "manifest.json": { ...manifest, schema_version: "3.0.0" } });
    await expect(loadData("/")).rejects.toThrow(/schema/i);
  });

  it("accepts a newer minor of the supported major", async () => {
    stubFetch({ "manifest.json": { ...manifest, schema_version: "2.4.2" } });
    await expect(loadData("/")).resolves.toBeDefined();
  });

  it("supports the major version the pipeline exports", () => {
    const config = readFileSync(
      resolve(process.cwd(), "../pipeline/src/pnw_health/config.py"),
      "utf8",
    );
    const version = /^SCHEMA_VERSION = "(\d+)\.\d+\.\d+"$/m.exec(config);
    expect(version).not.toBeNull();
    expect(SUPPORTED_SCHEMA_MAJOR).toBe(Number(version?.[1]));
  });

  it("uses a fixture manifest of the supported major", () => {
    expect(manifest.schema_version.split(".")[0]).toBe(String(SUPPORTED_SCHEMA_MAJOR));
  });
});
