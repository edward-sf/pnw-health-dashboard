import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { formatBound, formatValue } from "../color/formatValue";
import type { Indicator, Manifest, ValueEntry, ValuesFile } from "../types";
import { rankSummary } from "./rankSummary";
import { StripPlot } from "./StripPlot";
import { WhoLivesHere } from "./WhoLivesHere";

export type County = { fips: string; name: string; state: string };

type Props = {
  county: County;
  indicator: Indicator;
  entries: Record<string, ValueEntry>;
  counties: County[];
  manifest: Manifest;
  values: ValuesFile;
  focusRequested: boolean;
  onFocusHandled: () => void;
  onClose: () => void;
};

export function CountyPanel({
  county,
  indicator,
  entries,
  counties,
  manifest,
  values,
  focusRequested,
  onFocusHandled,
  onClose,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

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
  const ci =
    entry && entry.lo !== null && entry.hi !== null && indicator.ci_level !== null
      ? `${Math.round(indicator.ci_level * 100)}% CI ${formatBound(entry.lo, indicator.unit)}–${formatBound(entry.hi, indicator.unit)}`
      : null;
  const ranks =
    v !== null && indicator.direction !== "neutral"
      ? rankSummary(county.fips, entries, counties)
      : null;

  return (
    <aside className="county-panel" aria-label="County details">
      <div className="panel-header">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            {county.name}
          </h2>
          <p className="panel-state">{county.state}</p>
        </div>
        <button type="button" className="panel-close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="panel-measure">{indicator.label}</p>
      {v !== null ? (
        <>
          <p className="panel-value">{formatValue(v, indicator.unit)}</p>
          {ci && <p className="panel-ci">{ci}</p>}
          {ranks && <p className="panel-ranks">{ranks}</p>}
        </>
      ) : (
        <p className="panel-missing">
          {legacy
            ? `Reported only for the former Valdez-Cordova Census Area (combined area, CHR ${legacy.year}): ${formatValue(legacy.v, indicator.unit)}`
            : "Suppressed or not available"}{" "}
          <Link to="/methodology">Methodology</Link>
        </p>
      )}
      <StripPlot county={county} indicator={indicator} entries={entries} />
      <WhoLivesHere fips={county.fips} indicators={manifest.indicators} values={values} />
    </aside>
  );
}
