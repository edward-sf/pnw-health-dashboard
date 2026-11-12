import type { CountiesTopology, Manifest, ModelFile, ValuesFile } from "../types";

export type AppData = {
  manifest: Manifest;
  values: ValuesFile;
  topology: CountiesTopology;
  model: ModelFile;
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
  const [manifest, values, topology, model] = await Promise.all([
    fetchJson<Manifest>(`${dir}manifest.json`, signal),
    fetchJson<ValuesFile>(`${dir}values.json`, signal),
    fetchJson<CountiesTopology>(`${dir}counties.topojson`, signal),
    fetchJson<ModelFile>(`${dir}model.json`, signal),
  ]);
  const major = Number.parseInt(String(manifest.schema_version).split(".")[0] ?? "", 10);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(
      `Unsupported data schema version ${manifest.schema_version}; this site supports major version ${SUPPORTED_SCHEMA_MAJOR}.`,
    );
  }
  return { manifest, values, topology, model };
}
