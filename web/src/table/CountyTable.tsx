import { useMemo, useState } from "react";
import { formatBound, formatValue } from "../color/formatValue";
import type { Indicator } from "../types";
import { sortRows, type Row, type SortDir, type SortKey } from "./sortRows";

type Props = {
  rows: Row[];
  indicator: Indicator;
  selected: string | null;
  onSelect: (fips: string, opener: HTMLElement) => void;
};

export function CountyTable({ rows, indicator, selected, onSelect }: Props) {
  const neutral = indicator.direction === "neutral";
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(
    neutral ? { key: "value", dir: "desc" } : { key: "rank", dir: "asc" },
  );
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);

  const header = (key: SortKey, label: string) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="sort-button"
        onClick={() =>
          setSort((s) =>
            s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
          )
        }
      >
        {label}
      </button>
    </th>
  );

  return (
    <div className="county-table-wrap">
      <table className="county-table">
        <caption className="visually-hidden">{indicator.label} by county</caption>
        <thead>
          <tr>
            {header("name", "County")}
            {header("state", "State")}
            {header("value", "Value")}
            <th scope="col">
              {indicator.ci_level !== null ? `${Math.round(indicator.ci_level * 100)}% CI` : "CI"}
            </th>
            {!neutral && header("rank", "Rank")}
            {!neutral && header("state_rank", "State rank")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const e = r.entry;
            const v = e?.v ?? null;
            const ci =
              e && e.lo !== null && e.hi !== null
                ? `${formatBound(e.lo, indicator.unit)}–${formatBound(e.hi, indicator.unit)}`
                : "";
            return (
              <tr key={r.fips}>
                <td>
                  <button
                    type="button"
                    className="table-county"
                    aria-label={`${r.name}, ${r.state}`}
                    aria-current={r.fips === selected ? "true" : undefined}
                    onClick={(ev) => onSelect(r.fips, ev.currentTarget)}
                  >
                    {r.name}
                  </button>
                </td>
                <td>{r.state}</td>
                <td>
                  {v !== null
                    ? formatValue(v, indicator.unit)
                    : e?.legacy
                      ? "Former-area value in panel"
                      : formatValue(null, indicator.unit)}
                </td>
                <td>{ci}</td>
                {!neutral && <td>{e?.rank ?? ""}</td>}
                {!neutral && <td>{e?.state_rank ?? ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
