import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useId, useRef } from "react";
import { Link } from "react-router";
import { formatCi, formatValue } from "../color/formatValue";
import type {
  County,
  CountyModel,
  Indicator,
  Manifest,
  Peers,
  StrataFile,
  TargetModel,
  ValueEntry,
  ValuesFile,
} from "../types";
import { buildPeerRows } from "./buildPeerRows";
import { SimilarCounties } from "./SimilarCounties";
import { ModelCard } from "./ModelCard";
import { PanelShell } from "./PanelShell";
import { RaceBreakdown } from "./RaceBreakdown";
import { rankSummary } from "./rankSummary";
import { StripPlot } from "./StripPlot";
import { WhoLivesHere } from "./WhoLivesHere";

type Props = {
  county: County;
  indicator: Indicator;
  entries: Record<string, ValueEntry>;
  counties: County[];
  modelEntry: CountyModel;
  target: TargetModel;
  manifest: Manifest;
  values: ValuesFile;
  strata: StrataFile;
  /** The manifest indicator for the model target; its race breakdown follows the model card. */
  targetIndicator: Indicator | undefined;
  /** In model mode the model card comes first (parent spec §6). */
  modelMode: boolean;
  peers: Peers;
  /** Selects another county, exactly as a map click does. */
  onSelectCounty: (fips: string) => void;
  focusRequested: boolean;
  onFocusHandled: () => void;
  onClose: () => void;
  /** The outcomes the model card can switch between; given only when the measure is not one. */
  targets?: { id: string; label: string }[];
  onTargetChange?: (id: string) => void;
};

export function CountyPanel({
  county,
  indicator,
  entries,
  counties,
  modelEntry,
  target,
  manifest,
  values,
  strata,
  targetIndicator,
  modelMode,
  peers,
  onSelectCounty,
  focusRequested,
  onFocusHandled,
  onClose,
  targets,
  onTargetChange,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const similarId = useId();

  useEffect(() => {
    if (!focusRequested) return;
    headingRef.current?.focus();
    onFocusHandled();
  }, [focusRequested, onFocusHandled]);

  const entry = entries[county.fips];
  const v = entry?.v ?? null;
  const legacy = entry?.legacy ?? null;
  const ci = entry ? formatCi(entry.lo, entry.hi, indicator) : null;
  const ranks =
    v !== null && indicator.direction !== "neutral"
      ? rankSummary(county.fips, entries, counties)
      : null;

  const indicatorSection = (
    <div className="panel-indicator">
      <p className="panel-measure">{indicator.label}</p>
      {v !== null ? (
        <>
          <p className="panel-value">{formatValue(v, indicator.unit)}</p>
          {ci && <p className="panel-ci">{ci}</p>}
          {ranks && <p className="panel-ranks">{ranks}</p>}
          {entry?.unreliable && (
            <p className="panel-unreliable">
              The data source marks this estimate as unreliable, so read it and its rank with
              caution. <Link to="/methodology#unreliable">Methodology</Link>
            </p>
          )}
        </>
      ) : (
        <p className="panel-missing">
          {legacy
            ? `Reported only for the former Valdez-Cordova Census Area (combined area, CHR ${legacy.year}): ${formatValue(legacy.v, indicator.unit)}`
            : "Suppressed or not available"}{" "}
          <Link to={legacy ? "/methodology#legacy" : "/methodology#suppression"}>Methodology</Link>
        </p>
      )}
      {/* In model mode the breakdown is the target's, after the model card, so it is not repeated here. */}
      {!modelMode && (
        <RaceBreakdown indicator={indicator} fips={county.fips} overall={entry} strata={strata} />
      )}
      <StripPlot county={county} indicator={indicator} entries={entries} />
    </div>
  );
  const peerData = buildPeerRows(
    county.fips,
    peers,
    counties,
    modelMode ? { kind: "model", target } : { kind: "values", entries },
  );
  const modelCard = (
    <ModelCard
      county={county}
      entry={modelEntry}
      indicators={manifest.indicators}
      target={target}
      targets={targets}
      onTargetChange={onTargetChange}
    />
  );

  return (
    <PanelShell onClose={onClose}>
      <div className="panel-header">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            {county.name}
          </h2>
          <p className="panel-state">{county.state}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="panel-close"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="panel-body">
        {modelMode && modelCard}
        {modelMode && targetIndicator && (
          <RaceBreakdown
            indicator={targetIndicator}
            fips={county.fips}
            overall={values[targetIndicator.id]?.[county.fips]}
            strata={strata}
          />
        )}
        {indicatorSection}
        {!modelMode && modelCard}
        <WhoLivesHere fips={county.fips} indicators={manifest.indicators} values={values} />
        {peerData ? (
          <SimilarCounties
            data={peerData}
            unit={modelMode ? target.unit : indicator.unit}
            features={peers.method.features}
            indicators={manifest.indicators}
            onSelect={onSelectCounty}
          />
        ) : (
          <section className="similar-counties" aria-labelledby={similarId}>
            <h3 id={similarId}>Similar counties</h3>
            <p className="similar-basis">Not enough data to find similar counties.</p>
          </section>
        )}
      </div>
    </PanelShell>
  );
}
