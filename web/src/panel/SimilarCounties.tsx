import { useId } from "react";
import { Link } from "react-router";
import { formatValue } from "../color/formatValue";
import { modelDigits, tierLabel } from "../model/modelView";
import type { Unit } from "../types";
import type { Indicator } from "../types/generated/manifest";
import type { PeerData, PeerRow } from "./buildPeerRows";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number): string => WORDS[n] ?? String(n);
/** This many factors are named in the sentence; any others are counted. */
const NAMED_FACTORS = 3;

/** Lower-cases the first letter unless the label starts with an acronym or proper noun. */
function lowerFirst(label: string): string {
  const second = label.charAt(1);
  return second !== "" && second === second.toLowerCase() ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function basis(features: readonly string[], indicators: readonly Indicator[]): string {
  const labels = new Map(indicators.map((i) => [i.id, i.label]));
  const names = features
    .slice(0, NAMED_FACTORS)
    .map((id) => lowerFirst(labels.get(id) ?? id));
  const others = features.length - NAMED_FACTORS;
  const lead = "Most similar PNW counties on";
  if (others <= 0) return `${lead} ${joinNames(names)}.`;
  const measures = others === 1 ? "measure" : "measures";
  return `${lead} ${names.join(", ")} and ${countWord(others)} other social and economic ${measures}.`;
}

type Props = {
  data: PeerData;
  unit: Unit;
  /** Ordered feature ids that define similarity; the first three are named, the rest counted. */
  features: readonly string[];
  /** Manifest indicators, used to turn feature ids into labels. */
  indicators: readonly Indicator[];
  onSelect: (fips: string) => void;
};

export function SimilarCounties({ data, unit, features, indicators, onSelect }: Props) {
  const headingId = useId();
  const model = data.kind === "model";
  const rows: readonly PeerRow[] = data.rows;
  const { median } = data;
  const fmt = (v: number | null) =>
    v === null ? "Not available" : formatValue(v, unit, model ? modelDigits(unit) : undefined);
  return (
    <section className="similar-counties" aria-labelledby={headingId}>
      <h3 id={headingId}>Similar counties</h3>
      <p className="similar-basis">
        {basis(features, indicators)}{" "}
        <Link to="/methodology#similar-counties">Methodology</Link>
      </p>
      <table className="similar-table">
        <caption className="visually-hidden">
          Similar counties, nearest first, with the median of the similar
          counties
        </caption>
        <thead>
          <tr>
            <th scope="col">County</th>
            <th scope="col">{model ? "Actual" : "Value"}</th>
            {model && <th scope="col">Expected</th>}
            {model && <th scope="col">Compared with expected</th>}
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
              {r.kind === "model" && <td>{fmt(r.expected)}</td>}
              {r.kind === "model" && <td>{tierLabel(r.flag)}</td>}
            </tr>
          ))}
          <tr className="similar-median">
            <th scope="row">Peer median</th>
            <td>{fmt(median.value)}</td>
            {median.kind === "model" && <td>{fmt(median.expected)}</td>}
            {model && <td />}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
