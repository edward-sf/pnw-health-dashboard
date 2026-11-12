import { useId } from "react";
import { Link } from "react-router";
import { formatValue } from "../color/formatValue";
import { modelDigits, tierLabel } from "../model/modelView";
import type { Unit } from "../types";
import type { PeerMedian, PeerRow } from "./buildPeerRows";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number): string => WORDS[n] ?? String(n);

type Props = {
  rows: PeerRow[];
  median: PeerMedian;
  unit: Unit;
  mode: "values" | "model";
  /** How many factors define similarity; three are named in the sentence, the rest counted. */
  factorCount: number;
  onSelect: (fips: string) => void;
};

export function SimilarCounties({ rows, median, unit, mode, factorCount, onSelect }: Props) {
  const headingId = useId();
  const model = mode === "model";
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "Not available"
      : formatValue(v, unit, model ? modelDigits(unit) : undefined);
  return (
    <section className="similar-counties" aria-labelledby={headingId}>
      <h3 id={headingId}>Similar counties</h3>
      <p className="similar-basis">
        Most similar PNW counties on income, poverty, education and {countWord(factorCount - 3)} other
        social and economic measures.{" "}
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
              {model && <td>{fmt(r.expected)}</td>}
              {model && <td>{r.flag ? tierLabel(r.flag) : ""}</td>}
            </tr>
          ))}
          <tr className="similar-median">
            <th scope="row">Peer median</th>
            <td>{fmt(median.value)}</td>
            {model && <td>{fmt(median.expected)}</td>}
            {model && <td />}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
