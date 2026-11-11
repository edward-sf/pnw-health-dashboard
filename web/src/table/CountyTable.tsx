import { useMemo, useState } from "react";
import { formatBound, formatValue } from "../color/formatValue";
import type { Indicator } from "../types";
import { CountyCell } from "./CountyCell";
import { SortHeader } from "./SortHeader";
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

  return (
    <div className="county-table-wrap">
      <table className="county-table">
        <caption className="visually-hidden">{indicator.label} by county</caption>
        <thead>
          <tr>
            <SortHeader sortKey="name" label="County" sort={sort} onSort={setSort} />
            <SortHeader sortKey="state" label="State" sort={sort} onSort={setSort} />
            <SortHeader sortKey="value" label="Value" sort={sort} onSort={setSort} />
            <th scope="col">
              {indicator.ci_level !== null ? `${Math.round(indicator.ci_level * 100)}% CI` : "CI"}
            </th>
            {!neutral && <SortHeader sortKey="rank" label="Rank" sort={sort} onSort={setSort} />}
            {!neutral && (
              <SortHeader sortKey="state_rank" label="State rank" sort={sort} onSort={setSort} />
            )}
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
                <CountyCell
                  fips={r.fips}
                  name={r.name}
                  state={r.state}
                  selected={r.fips === selected}
                  onSelect={onSelect}
                />
                <td>{r.state}</td>
                <td className="num">
                  {v !== null
                    ? `${formatValue(v, indicator.unit)}${e?.unreliable ? " (unreliable)" : ""}`
                    : e?.legacy
                      ? "Former-area value in panel"
                      : formatValue(null, indicator.unit)}
                </td>
                <td className="num">{ci}</td>
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
