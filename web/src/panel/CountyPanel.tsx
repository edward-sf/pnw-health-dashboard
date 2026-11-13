import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { formatCi, formatValue } from "../color/formatValue";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
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
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyId = useId();
  const similarId = useId();
  const isPhone = useMediaQuery(PHONE_QUERY);
  // The county the sheet was expanded for. It is cleared once another county is selected or the
  // viewport goes wide, so the sheet always opens in peek and never comes back expanded.
  const [expandedFips, setExpandedFips] = useState<string | null>(null);
  if (expandedFips !== null && (expandedFips !== county.fips || !isPhone)) {
    setExpandedFips(null);
  }
  const expanded = isPhone && expandedFips === county.fips;

  useEffect(() => {
    if (!focusRequested) return;
    headingRef.current?.focus();
    onFocusHandled();
  }, [focusRequested, onFocusHandled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    />
  );

  return (
    <aside
      className={
        isPhone
          ? `county-panel county-panel--sheet${expanded ? " county-panel--expanded" : ""}`
          : "county-panel"
      }
      aria-label="County details"
    >
      {isPhone && <div className="sheet-handle" aria-hidden="true" />}
      <div className="panel-header">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            {county.name}
          </h2>
          <p className="panel-state">{county.state}</p>
        </div>
        <div className="panel-actions">
          {isPhone && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="panel-expand"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => setExpandedFips(expanded ? null : county.fips)}
            >
              {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
              {expanded ? "Collapse" : "Expand"}
            </Button>
          )}
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
      </div>
      <div id={bodyId} className="panel-body">
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
    </aside>
  );
}
