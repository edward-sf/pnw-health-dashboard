import { useId, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router";
import { formatSigned, formatValue } from "../color/formatValue";
import { usePalette } from "../color/palette";
import { buildShapBars, type ShapBar } from "../model/buildShapBars";
import { type CompleteModel, hasModelResult, modelDigits, tierFill, tierLabel } from "../model/modelView";
import { directionNote, outcomeName } from "../model/targetView";
import type { County, CountyModel, Indicator, TargetModel } from "../types";
import { ResidualRange } from "./ResidualRange";
import { ShapBars } from "./ShapBars";

type Props = {
  county: County;
  entry: CountyModel;
  indicators: Indicator[];
  target: TargetModel;
  /** The outcomes to choose between. With `onTargetChange`, the heading carries an Outcome select. */
  targets?: { id: string; label: string }[];
  onTargetChange?: (id: string) => void;
};

export function ModelCard({ county, entry, indicators, target, targets, onTargetChange }: Props) {
  const headingId = useId();
  const bars = useMemo(() => buildShapBars(entry, indicators, target.unit), [entry, indicators, target.unit]);
  // Target models carry no id of their own, so the current one is found by its label.
  const selectedId = targets?.find((t) => t.label === target.label)?.id;

  return (
    <section className="model-card" aria-labelledby={headingId} data-county={county.fips}>
      <div className="model-card-heading">
        <div className="model-card-title">
          <h3 id={headingId}>{target.label} model</h3>
          <InfoTip label={`About the ${target.label} model`}>
            <p>{rangeNote(entry, target)}</p>
          </InfoTip>
        </div>
        {targets && onTargetChange && (
          <Select value={selectedId} onValueChange={onTargetChange}>
            <SelectTrigger aria-label="Outcome" className="model-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {hasModelResult(entry) ? (
        <ModelResult entry={entry} bars={bars} target={target} />
      ) : (
        <p className="model-none">
          The model has no result for this county because its {outcomeName(target.label)} figure isn't reported.{" "}
          <Link to="/methodology#no-result">Methodology</Link>
        </p>
      )}
    </section>
  );
}

function ModelResult({
  entry,
  bars,
  target,
}: {
  entry: CompleteModel;
  bars: ShapBar[];
  target: TargetModel;
}) {
  const palette = usePalette();
  const { unit } = target;
  const note = directionNote(target);
  const d = modelDigits(unit);
  const { actual, predicted, residual, threshold_75, threshold_90 } = entry;
  return (
    <>
      <dl className="model-figures">
        <div>
          <dt>Actual</dt>
          <dd>{figure(formatValue(actual, unit, d))}</dd>
        </div>
        <div>
          <dt>Expected</dt>
          <dd>{figure(formatValue(predicted, unit, d))}</dd>
        </div>
        <div>
          <dt>Difference</dt>
          <dd>
            <strong>{figure(formatSigned(residual, unit, d))}</strong>
          </dd>
        </div>
      </dl>
      {note && <p className="model-direction-note">{note}</p>}
      <p>
        <Badge className="tier-badge">
          <span
            className="tier-swatch"
            aria-hidden="true"
            style={{ background: tierFill(entry.flag, palette) }}
          />
          {tierLabel(entry.flag, target.direction)}
        </Badge>
      </p>
      <ResidualRange
        residual={residual}
        threshold75={threshold_75}
        threshold90={threshold_90}
        flag={entry.flag}
        unit={unit}
        direction={target.direction}
        note={note}
      />
      <hr className="model-divider" />
      <div className="model-factors">
        <div className="model-factors-heading">
          <h4>Associated factors</h4>
          <InfoTip label="About associated factors">
            <p>
              They describe what the model expects for a county with this profile; they don't
              explain the difference above.
            </p>
            <p>
              Some factors stand in for others the model doesn't see. For example, high housing
              costs often go with expensive metro areas and college towns, so a higher housing
              cost burden can raise the expected value.
            </p>
          </InfoTip>
        </div>
        <ShapBars bars={bars} direction={target.direction} />
      </div>
    </>
  );
}

/** What the tiers mean, for the heading's ⓘ; general when the county has no result. */
function rangeNote(entry: CountyModel, target: TargetModel): string {
  if (!hasModelResult(entry)) {
    return "A difference beyond the model's thresholds is flagged as somewhat or notably higher or lower. These ranges allow for the model's typical error and each county's measurement uncertainty.";
  }
  const d = modelDigits(target.unit);
  return `A difference beyond ±${formatValue(entry.threshold_75, target.unit, d)} is flagged as somewhat higher or lower, and beyond ±${formatValue(entry.threshold_90, target.unit, d)} as notably. These ranges allow for the model's typical error and ${
    entry.se === null
      ? "a typical county's measurement uncertainty, since this county's estimate has no confidence interval."
      : "this county's own measurement uncertainty."
  }`;
}

/**
 * A figure with its number kept whole and its unit free to wrap below it, so "24,556 per 100k"
 * fits a third of a 320px panel without running into the next column.
 */
function figure(text: string) {
  const m = /^(\S+) (.+)$/.exec(text);
  if (!m) return text;
  return (
    <>
      <span className="model-figure-number">{m[1]}</span>{" "}
      <span className="model-figure-unit">{m[2]}</span>
    </>
  );
}
