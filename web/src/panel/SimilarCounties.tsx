import { useId } from "react";
import { Link } from "react-router";
import { InfoTip } from "@/components/ui/info-tip";
import { formatValue } from "../color/formatValue";
import { usePalette } from "../color/palette";
import { type Direction, modelDigits, shortTierLabel, tierFill } from "../model/modelView";
import type { Unit } from "../types";
import type { Indicator } from "../types/generated/manifest";
import type { PeerData, PeerRow } from "./buildPeerRows";

/** Lower-cases the first letter unless the label starts with an acronym or proper noun. */
function lowerFirst(label: string): string {
  const second = label.charAt(1);
  return second !== "" && second === second.toLowerCase() ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Every measure the similarity is computed on, in order, for the ⓘ. */
function matchedOn(features: readonly string[], indicators: readonly Indicator[]): string {
  const labels = new Map(indicators.map((i) => [i.id, i.label]));
  return `Matched on ${joinNames(features.map((id) => lowerFirst(labels.get(id) ?? id)))}.`;
}

type Props = {
  data: PeerData;
  unit: Unit;
  /** The model outcome's direction, which fixes the wording of each tier. */
  direction: Direction;
  /** Ordered feature ids that define similarity, all named behind the ⓘ. */
  features: readonly string[];
  /** Manifest indicators, used to turn feature ids into labels. */
  indicators: readonly Indicator[];
  onSelect: (fips: string) => void;
};

export function SimilarCounties({ data, unit, direction, features, indicators, onSelect }: Props) {
  const headingId = useId();
  const palette = usePalette();
  const model = data.kind === "model";
  const rows: readonly PeerRow[] = data.rows;
  const { median } = data;
  const fmt = (v: number | null) =>
    v === null ? "Not available" : formatValue(v, unit, model ? modelDigits(unit) : undefined);
  return (
    <section className="similar-counties" aria-labelledby={headingId}>
      <h3 id={headingId}>Similar counties</h3>
      <div className="similar-basis">
        <p>Counties with the most similar social and economic profile.</p>
        <InfoTip label="About similar counties">
          <p>
            {matchedOn(features, indicators)}{" "}
            <Link to="/methodology#similar-counties">Methodology</Link>
          </p>
        </InfoTip>
      </div>
      <table className="similar-table">
        <caption className="visually-hidden">
          Similar counties, nearest first, with the median of the similar
          counties
        </caption>
        <thead>
          <tr>
            <th scope="col">County</th>
            <th scope="col">{model ? "Actual" : "Value"}</th>
            {model && <th scope="col">Compared</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.fips}
              className={r.isSelected ? "similar-selected" : undefined}
            >
              <th scope="row">
                {r.isSelected ? (
                  <>
                    {r.name}, {r.state} <span className="similar-this">(this county)</span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="similar-peer"
                    onClick={() => onSelect(r.fips)}
                  >
                    {r.name}, {r.state}
                  </button>
                )}
              </th>
              <td>{fmt(r.value)}</td>
              {r.kind === "model" && (
                <td className="similar-tier">
                  <span
                    className="tier-swatch"
                    aria-hidden="true"
                    style={{ background: tierFill(r.flag, palette) }}
                  />
                  {shortTierLabel(r.flag, direction)}
                </td>
              )}
            </tr>
          ))}
          <tr className="similar-median">
            <th scope="row">Peer median</th>
            <td>{fmt(median.value)}</td>
            {model && <td />}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
