import { useId, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router";
import { formatSigned, formatValue } from "../color/formatValue";
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
        <h3 id={headingId}>{target.label} model</h3>
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
  const { unit } = target;
  const note = directionNote(target);
  const d = modelDigits(unit);
  const { actual, predicted, residual, threshold_75, threshold_90, base_value } = entry;
  return (
    <>
      <div className="model-compare">
        <h4>How this county compares</h4>
        <p className="model-numbers">
          <span>Actual {formatValue(actual, unit, d)}</span>
          {" · "}
          <span>Expected {formatValue(predicted, unit, d)}</span>
          {" · "}
          <strong>Difference {formatSigned(residual, unit, d)}</strong>
        </p>
        {note && <p className="model-direction-note">{note}</p>}
        <p className="model-rounded-note">Figures are rounded.</p>
        <p>
          <Badge className="tier-badge">
            <span
              className="tier-swatch"
              aria-hidden="true"
              style={{ background: tierFill(entry.flag) }}
            />
            {tierLabel(entry.flag)}
          </Badge>
        </p>
        <ResidualRange
          residual={residual}
          threshold75={threshold_75}
          threshold90={threshold_90}
          flag={entry.flag}
          unit={unit}
          note={note}
        />
        <p className="model-range-note">
          {`A difference beyond ±${formatValue(threshold_75, unit, d)} is flagged as somewhat better or worse, and beyond ±${formatValue(threshold_90, unit, d)} as notably. These ranges allow for the model's typical error and ${
            entry.se === null
              ? "a typical county's measurement uncertainty, since this county's estimate has no confidence interval."
              : "this county's own measurement uncertainty."
          }`}
        </p>
      </div>
      <hr className="model-divider" />
      <div className="model-factors">
        <h4>Factors associated with the expected value</h4>
        <p>
          {`These factors moved the model's expected value from a starting point of ${formatValue(base_value, unit, modelDigits(unit, 2))} to ${formatValue(predicted, unit, modelDigits(unit, 2))}. They describe what the model expects for a county with this profile; they don't explain the difference above.`}
        </p>
        <ShapBars bars={bars} />
        <p className="model-factors-note">
          Some factors stand in for others the model doesn't see. For example, high housing costs
          often go with expensive metro areas and college towns, so a higher housing cost burden
          can raise the expected value.
        </p>
      </div>
    </>
  );
}
