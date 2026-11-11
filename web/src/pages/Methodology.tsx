import { Link } from "react-router";
import ErrorPage from "../data/ErrorPage";
import type { DataState } from "../data/useData";
import { AtAGlance } from "./methodology/AtAGlance";
import { ExclusionsSection } from "./methodology/ExclusionsSection";
import { HarmonizationSection } from "./methodology/HarmonizationSection";
import { IndicatorCatalog } from "./methodology/IndicatorCatalog";
import { MissingDataSection } from "./methodology/MissingDataSection";
import { ModelSection } from "./methodology/ModelSection";
import { ReproducibilitySection } from "./methodology/ReproducibilitySection";
import { SourcesSection } from "./methodology/SourcesSection";
import { useHashFocus } from "./methodology/useHashFocus";

const CONTENTS = [
  ["sources", "Sources and vintages"],
  ["indicators", "Indicators"],
  ["harmonization", "Geography"],
  ["missing-data", "Missing and uncertain values"],
  ["model", "The life expectancy model"],
  ["exclusions", "What the model leaves out"],
  ["model-card", "Reproducibility"],
] as const;

export function Methodology({ state }: { state: DataState }) {
  useHashFocus(state.status === "ready");
  return (
    <section className="methodology">
      <h2 tabIndex={-1}>Methodology</h2>
      {state.status === "loading" && <p>Loading data…</p>}
      {state.status === "error" && <ErrorPage message={state.message} onRetry={state.retry} />}
      {state.status === "ready" && (
        <>
          <AtAGlance data={state.data} />
          <nav aria-label="On this page" className="methodology-toc">
            <ul>
              {CONTENTS.map(([id, title]) => (
                <li key={id}>
                  <Link to={{ hash: id }}>{title}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <SourcesSection sources={state.data.manifest.sources} />
          <IndicatorCatalog indicators={state.data.manifest.indicators} />
          <HarmonizationSection sources={state.data.manifest.sources} />
          <MissingDataSection indicators={state.data.manifest.indicators} />
          <ModelSection model={state.data.model} indicators={state.data.manifest.indicators} />
          <ExclusionsSection model={state.data.model} />
          <ReproducibilitySection model={state.data.model} builtAt={state.data.manifest.built_at} />
        </>
      )}
    </section>
  );
}
