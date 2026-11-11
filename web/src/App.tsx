import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router";
import ErrorPage from "./data/ErrorPage";
import { type DataState, useData } from "./data/useData";
import { usePageTitle } from "./hooks/usePageTitle";
import { useRouteFocus } from "./hooks/useRouteFocus";
import { Explorer } from "./explorer/Explorer";
import { About } from "./pages/About";
import { Methodology } from "./pages/Methodology";

function useLastExplorerSearch(): string {
  const { pathname, search } = useLocation();
  const [last, setLast] = useState("");
  if (pathname === "/" && search !== last) setLast(search);
  return pathname === "/" ? search : last;
}

function ExplorerRoute({ state }: { state: DataState }) {
  usePageTitle("PNW Health Dashboard");
  return (
    <>
      {state.status === "loading" && <p>Loading data…</p>}
      {state.status === "error" && (
        <ErrorPage message={state.message} onRetry={state.retry} />
      )}
      {state.status === "ready" && <Explorer data={state.data} />}
    </>
  );
}

export default function App() {
  const state = useData();
  const explorerSearch = useLastExplorerSearch();
  useRouteFocus();
  return (
    <>
      <header className="site-header">
        <h1>PNW Health Dashboard</h1>
        <nav aria-label="Primary">
          <NavLink to={{ pathname: "/", search: explorerSearch }} end>
            Explorer
          </NavLink>{" "}
          <NavLink to="/methodology">Methodology</NavLink>{" "}
          <NavLink to="/about">About</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ExplorerRoute state={state} />} />
          <Route path="/methodology" element={<Methodology state={state} />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
