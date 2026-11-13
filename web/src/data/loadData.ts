import type { CountiesTopology, Manifest, ModelFile, StrataFile, ValuesFile } from "../types";

export type AppData = {
  manifest: Manifest;
  values: ValuesFile;
  topology: CountiesTopology;
  model: ModelFile;
  strata: StrataFile;
};

/** Must match the major of the pipeline's `SCHEMA_VERSION`; a test checks it. */
export const SUPPORTED_SCHEMA_MAJOR = 2;

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function loadData(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<AppData> {
  const dir = `${baseUrl}data/`;
  const [manifest, values, topology, model, strata] = await Promise.all([
    fetchJson<Manifest>(`${dir}manifest.json`, signal),
    fetchJson<ValuesFile>(`${dir}values.json`, signal),
    fetchJson<CountiesTopology>(`${dir}counties.topojson`, signal),
    fetchJson<unknown>(`${dir}model.json`, signal),
    fetchJson<unknown>(`${dir}strata.json`, signal),
  ]);
  const major = Number.parseInt(String(manifest.schema_version).split(".")[0] ?? "", 10);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(
      `Unsupported data schema version ${manifest.schema_version}; this site supports major version ${SUPPORTED_SCHEMA_MAJOR}.`,
    );
  }
  if (!isModelFile(model)) {
    throw new Error(
      "The model data (model.json) is incomplete or malformed. Reload the page to try again.",
    );
  }
  if (!isStrataFile(strata)) {
    throw new Error(
      "The race breakdown data (strata.json) is incomplete or malformed. Reload the page to try again.",
    );
  }
  return { manifest, values, topology, model, strata };
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The parts of model.json every page relies on: at least one target, and the peers. */
function isModelFile(model: unknown): model is ModelFile {
  if (!isObject(model)) return false;
  const { targets, peers } = model;
  return (
    isObject(targets) &&
    Object.keys(targets).length > 0 &&
    isObject(peers) &&
    isObject(peers.method) &&
    isObject(peers.counties)
  );
}

/** The parts of strata.json the county panel relies on. */
function isStrataFile(strata: unknown): strata is StrataFile {
  return isObject(strata) && Array.isArray(strata.groups) && isObject(strata.indicators);
}
