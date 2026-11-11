import { useMemo, useState } from "react";
import { formatSigned, formatValue } from "../color/formatValue";
import { tierLabel } from "../model/modelView";
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

  const header = (key: ModelSortKey, label: string) => (
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
        <caption className="visually-hidden">
          Life expectancy compared with expected, by county
        </caption>
        <thead>
          <tr>
            {header("name", "County")}
            {header("state", "State")}
            {header("actual", "Life expectancy")}
            {header("expected", "Expected")}
            {header("difference", "Difference")}
            {header("result", "Result")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const { actual, predicted, residual, flag } = r.model;
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
