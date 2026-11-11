import ErrorPage from "./data/ErrorPage";
import { useData } from "./data/useData";

export default function App() {
  const state = useData();
  return (
    <main>
      <h1>PNW Health Dashboard</h1>
      {state.status === "loading" && <p>Loading data…</p>}
      {state.status === "error" && (
        <ErrorPage message={state.message} onRetry={state.retry} />
      )}
      {state.status === "ready" && (
        <p>{state.data.manifest.indicators.length} indicators loaded.</p>
      )}
    </main>
  );
}
