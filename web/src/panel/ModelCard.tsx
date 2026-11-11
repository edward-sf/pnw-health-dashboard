import { useId, useMemo } from "react";
import { Link } from "react-router";
import { formatBound, formatSigned, formatValue } from "../color/formatValue";
import { buildShapBars } from "../model/buildShapBars";
import { tierFill, tierLabel } from "../model/modelView";
import type { County, CountyModel, Indicator } from "../types";
import { ResidualRange } from "./ResidualRange";
import { ShapBars } from "./ShapBars";

type Props = { county: County; entry: CountyModel; indicators: Indicator[] };

export function ModelCard({ county, entry, indicators }: Props) {
  const headingId = useId();
  const bars = useMemo(() => buildShapBars(entry, indicators), [entry, indicators]);
  const { actual, predicted, residual, threshold_75, threshold_90, base_value } = entry;
  const hasResult =
    entry.flag !== "insufficient_data" &&
    actual !== null &&
    predicted !== null &&
    residual !== null &&
    threshold_75 !== null &&
    threshold_90 !== null &&
    base_value !== null;

  return (
    <section className="model-card" aria-labelledby={headingId} data-county={county.fips}>
      <h3 id={headingId}>Life expectancy model</h3>
      {!hasResult ? (
        <p className="model-none">
          The model has no result for this county because its life expectancy isn't reported.{" "}
          <Link to="/methodology">Methodology</Link>
        </p>
      ) : (
        <>
          <div className="model-compare">
            <h4>How this county compares</h4>
            <p className="model-numbers">
              <span>Actual {formatValue(actual, "years")}</span>
              {" · "}
              <span>Expected {formatValue(predicted, "years")}</span>
              {" · "}
              <strong>Difference {formatSigned(residual, "years")}</strong>
            </p>
            <p>
              <span className="tier-badge">
                <span
                  className="tier-swatch"
                  aria-hidden="true"
                  style={{ background: tierFill(entry.flag) }}
                />
                {tierLabel(entry.flag)}
              </span>
            </p>
            <ResidualRange
              residual={residual}
              threshold75={threshold_75}
              threshold90={threshold_90}
              flag={entry.flag}
            />
            <p className="model-range-note">
              {`A difference beyond ±${formatBound(threshold_75, "years")} years is flagged as somewhat better or worse, and beyond ±${formatBound(threshold_90, "years")} years as notably. These ranges allow for the model's typical error and ${
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
              {`These factors moved the model's expected value from a starting point of ${formatBound(base_value, "years")} to ${formatValue(predicted, "years")}. They describe what the model expects for a county with this profile; they don't explain the difference above.`}
            </p>
            <ShapBars bars={bars} />
          </div>
        </>
      )}
    </section>
  );
}
