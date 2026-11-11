import ErrorPage from "./data/ErrorPage";
import { useMemo, useState } from "react";
import { useData } from "./data/useData";
import { buildMapPaths } from "./map/buildMapPaths";
import { CountyMap } from "./map/CountyMap";

const fillFor = () => "#9ecae1";

export default function App() {
  const state = useData();
  const topology = state.status === "ready" ? state.data.topology : null;
  const paths = useMemo(() => (topology ? buildMapPaths(topology) : []), [topology]);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <main>
      <h1>PNW Health Dashboard</h1>
      {state.status === "loading" && <p>Loading data…</p>}
      {state.status === "error" && (
        <ErrorPage message={state.message} onRetry={state.retry} />
      )}
      {state.status === "ready" && (
        <CountyMap
          paths={paths}
          fillFor={fillFor}
          tooltipFor={(fips) => paths.find((p) => p.fips === fips)?.name ?? fips}
          selected={selected}
          onSelect={setSelected}
        />
      )}
    </main>
  );
}
