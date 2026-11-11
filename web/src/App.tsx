import { Link, Navigate, Route, Routes } from "react-router";
import ErrorPage from "./data/ErrorPage";
import { useData } from "./data/useData";
import { Explorer } from "./explorer/Explorer";
import { About } from "./pages/About";
import { Methodology } from "./pages/Methodology";

export default function App() {
  const state = useData();
  return (
    <main>
      <h1>PNW Health Dashboard</h1>
      <nav aria-label="Primary">
        <Link to="/">Explorer</Link> <Link to="/methodology">Methodology</Link>{" "}
        <Link to="/about">About</Link>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            <>
              {state.status === "loading" && <p>Loading data…</p>}
              {state.status === "error" && (
                <ErrorPage message={state.message} onRetry={state.retry} />
              )}
              {state.status === "ready" && <Explorer data={state.data} />}
            </>
          }
        />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
