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

/** How long the data may take to load before the error page says so. */
export const LOAD_TIMEOUT_MS = 30_000;
const TIMEOUT_MESSAGE = "Loading the data took too long. Reload the page to try again.";

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Fetches and checks the site's data. The caller's `signal` aborts the fetches. After
 * `LOAD_TIMEOUT_MS` they are aborted too and the promise rejects with a message for the error
 * page, so a request that never settles can't leave the page loading forever. (A helper rather
 * than `AbortSignal.any`/`AbortSignal.timeout`, which Safari before 17.4 lacks.)
 */
export async function loadData(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<AppData> {
  const dir = `${baseUrl}data/`;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Rejects on its own as well as aborting, in case a body read ignores the abort.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(TIMEOUT_MESSAGE));
      controller.abort();
    }, LOAD_TIMEOUT_MS);
  });
  const s = controller.signal;
  let files: [Manifest, ValuesFile, CountiesTopology, unknown, unknown];
  try {
    files = await Promise.race([
      Promise.all([
        fetchJson<Manifest>(`${dir}manifest.json`, s),
        fetchJson<ValuesFile>(`${dir}values.json`, s),
        fetchJson<CountiesTopology>(`${dir}counties.topojson`, s),
        fetchJson<unknown>(`${dir}model.json`, s),
        fetchJson<unknown>(`${dir}strata.json`, s),
      ]),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
  const [manifest, values, topology, model, strata] = files;
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
