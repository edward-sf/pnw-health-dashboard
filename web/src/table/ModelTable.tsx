import { useMemo, useState } from "react";
import { formatSigned, formatValue } from "../color/formatValue";
import { tierLabel } from "../model/modelView";
import { CountyCell } from "./CountyCell";
import { SortHeader } from "./SortHeader";
import type { SortDir } from "./sortRows";
import { sortModelRows, type ModelRow, type ModelSortKey } from "./sortModelRows";

type Props = {
  rows: ModelRow[];
  selected: string | null;
  onSelect: (fips: string, opener: HTMLElement) => void;
};

export function ModelTable({ rows, selected, onSelect }: Props) {
  const [sort, setSort] = useState<{ key: ModelSortKey; dir: SortDir }>({
    key: "result",
    dir: "asc",
  });
  const sorted = useMemo(() => sortModelRows(rows, sort.key, sort.dir), [rows, sort]);

  return (
    <div className="county-table-wrap">
      <table className="county-table">
        <caption className="visually-hidden">
          Life expectancy compared with expected, by county
        </caption>
        <thead>
          <tr>
            <SortHeader sortKey="name" label="County" sort={sort} onSort={setSort} />
            <SortHeader sortKey="state" label="State" sort={sort} onSort={setSort} />
            <SortHeader sortKey="actual" label="Life expectancy" sort={sort} onSort={setSort} />
            <SortHeader sortKey="expected" label="Expected" sort={sort} onSort={setSort} />
            <SortHeader sortKey="difference" label="Difference" sort={sort} onSort={setSort} />
            <SortHeader sortKey="result" label="Result" sort={sort} onSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const { actual, predicted, residual, flag } = r.model;
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
                <td className="num">{actual !== null ? formatValue(actual, "years") : ""}</td>
                <td className="num">{predicted !== null ? formatValue(predicted, "years") : ""}</td>
                <td className="num">{residual !== null ? formatSigned(residual, "years") : ""}</td>
                <td>{tierLabel(flag)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
