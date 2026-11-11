import ErrorPage from "./data/ErrorPage";
import { useMemo, useState } from "react";
import { useData } from "./data/useData";
import { buildMapPaths } from "./map/buildMapPaths";
import { CountyMap } from "./map/CountyMap";
import { Legend } from "./color/Legend";
import { formatValue } from "./color/formatValue";
import { makeColorScale } from "./color/makeColorScale";

export default function App() {
  const state = useData();
  const topology = state.status === "ready" ? state.data.topology : null;
  const paths = useMemo(() => (topology ? buildMapPaths(topology) : []), [topology]);
  const indicator = state.status === "ready" ? state.data.manifest.indicators[0] : null;
  const valuesFile = state.status === "ready" ? state.data.values : null;
  const scale = useMemo(
    () =>
      indicator && valuesFile
        ? makeColorScale(indicator, valuesFile[indicator.id] ?? {})
        : null,
    [indicator, valuesFile],
  );
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <main>
      <h1>PNW Health Dashboard</h1>
      {state.status === "loading" && <p>Loading data…</p>}
      {state.status === "error" && (
        <ErrorPage message={state.message} onRetry={state.retry} />
      )}
      {indicator && valuesFile && scale && (
        <>
          <CountyMap
            paths={paths}
            fillFor={(fips) => scale.fill(valuesFile[indicator.id]?.[fips]?.v ?? null)}
            tooltipFor={(fips) => {
              const p = paths.find((x) => x.fips === fips);
              const v = valuesFile[indicator.id]?.[fips]?.v ?? null;
              return `${p?.name ?? fips}, ${p?.state ?? ""}: ${formatValue(v, indicator.unit)}`;
            }}
            selected={selected}
            onSelect={setSelected}
          />
          <Legend scale={scale} unit={indicator.unit} />
        </>
      )}
    </main>
  );
}
