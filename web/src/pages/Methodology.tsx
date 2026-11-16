import { useState } from "react";
import { Link } from "react-router";
import ErrorPage from "../data/ErrorPage";
import { pageTitle } from "../brand/brand";
import { usePageTitle } from "../hooks/usePageTitle";
import type { DataState } from "../data/useData";
import { defaultTargetId, targetModel } from "../model/targetView";
import { ExclusionsSection } from "./methodology/ExclusionsSection";
import { HarmonizationSection } from "./methodology/HarmonizationSection";
import { IndicatorCatalog } from "./methodology/IndicatorCatalog";
import { MissingDataSection } from "./methodology/MissingDataSection";
import { ModelSection } from "./methodology/ModelSection";
import { PipelineHero } from "./methodology/PipelineHero";
import { PeersSection } from "./methodology/PeersSection";
import { RaceBreakdownSection } from "./methodology/RaceBreakdownSection";
import { ReproducibilitySection } from "./methodology/ReproducibilitySection";
import { SourcesSection } from "./methodology/SourcesSection";
import { MethodologyStep } from "./methodology/MethodologyStep";
import { FETCH, HARMONIZE, MODEL, PUBLISH, STEPS } from "./methodology/steps";
import { useHashFocus } from "./methodology/useHashFocus";

export function Methodology({ state }: { state: DataState }) {
  usePageTitle(pageTitle("Methodology"));
  useHashFocus(state.status === "ready");
  // Null until the reader picks an outcome; the default needs the loaded model's targets.
  const [picked, setTargetId] = useState<string | null>(null);
  const targetIds = state.status === "ready" ? Object.keys(state.data.model.targets) : [];
  const targetId = picked ?? defaultTargetId(targetIds);
  return (
    <section className="methodology">
      <h2 tabIndex={-1} data-page-heading>
        How the atlas is built
      </h2>
      {state.status === "loading" && <p className="app-status">Loading data…</p>}
      {state.status === "error" && <ErrorPage message={state.message} onRetry={state.retry} />}
      {state.status === "ready" && (
        <>
          <PipelineHero data={state.data} />
          <nav aria-label="On this page" className="methodology-toc">
            <ul>
              {STEPS.flatMap((step) => step.sections).map(({ id, railLabel }) => (
                <li key={id}>
                  <Link to={{ hash: id }}>{railLabel}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <MethodologyStep step={FETCH} index={0}>
            <SourcesSection sources={state.data.manifest.sources} />
            <IndicatorCatalog indicators={state.data.manifest.indicators} />
          </MethodologyStep>
          <MethodologyStep step={HARMONIZE} index={1}>
            <HarmonizationSection sources={state.data.manifest.sources} />
            <MissingDataSection indicators={state.data.manifest.indicators} />
            <RaceBreakdownSection
              strata={state.data.strata}
              indicators={state.data.manifest.indicators}
            />
          </MethodologyStep>
          <MethodologyStep step={MODEL} index={2}>
            <ModelSection
              model={state.data.model}
              targetId={targetId}
              onTargetChange={setTargetId}
              indicators={state.data.manifest.indicators}
            />
            <ExclusionsSection model={state.data.model} targetId={targetId} />
            <PeersSection
              peers={state.data.model.peers}
              indicators={state.data.manifest.indicators}
            />
          </MethodologyStep>
          <MethodologyStep step={PUBLISH} index={3}>
            <ReproducibilitySection
              model={targetModel(state.data.model, targetId)}
              builtAt={state.data.manifest.built_at}
            />
          </MethodologyStep>
        </>
      )}
    </section>
  );
}
