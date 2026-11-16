import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import ErrorPage from "../data/ErrorPage";
import { pageTitle } from "../brand/brand";
import { usePageTitle } from "../hooks/usePageTitle";
import type { DataState } from "../data/useData";
import { useMediaQuery } from "../hooks/useMediaQuery";
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
import { ReadingRail } from "./methodology/ReadingRail";
import { FETCH, HARMONIZE, MODEL, PUBLISH, SECTION_IDS } from "./methodology/steps";
import { useHashFocus } from "./methodology/useHashFocus";
import { END_SENTINEL_ID, useScrollSpy } from "./methodology/useScrollSpy";

export function Methodology({ state }: { state: DataState }) {
  usePageTitle(pageTitle("Methodology"));
  const ready = state.status === "ready";
  const smooth = !useMediaQuery("(prefers-reduced-motion: reduce)");
  useHashFocus(ready, smooth);
  const navigate = useNavigate();
  const { current, pin } = useScrollSpy(SECTION_IDS, ready);
  const onPick = useCallback(
    (id: string) => {
      pin(id);
      navigate({ hash: id });
    },
    [pin, navigate],
  );
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
          <div className="methodology-layout">
            <ReadingRail current={current} onPick={onPick} />
            <div className="methodology-body">
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
              <div id={END_SENTINEL_ID} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
