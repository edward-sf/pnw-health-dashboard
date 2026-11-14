import { useMemo, useState } from "react";
import { formatSigned, formatValue } from "../color/formatValue";
import { usePalette } from "../color/palette";
import { modelDigits, tierFill, tierLabel } from "../model/modelView";
import type { TargetModel } from "../types";
import { CountyCell } from "./CountyCell";
import { SortHeader } from "./SortHeader";
import type { Sort } from "./sortRows";
import { sortModelRows, type ModelRow, type ModelSortKey } from "./sortModelRows";

type Props = {
  rows: ModelRow[];
  selected: string | null;
  onSelect: (fips: string, opener: HTMLElement) => void;
  target: TargetModel;
};

export function ModelTable({ rows, selected, onSelect, target }: Props) {
  const palette = usePalette();
  const [sort, setSort] = useState<Sort<ModelSortKey>>({
    key: "result",
    dir: "asc",
  });
  const d = modelDigits(target.unit);
  const sorted = useMemo(
    () => sortModelRows(rows, sort.key, sort.dir, target.direction),
    [rows, sort, target.direction],
  );

  return (
    <div className="county-table-wrap">
      <table className="county-table">
        <caption className="visually-hidden">
          {target.label} compared with expected, by county
        </caption>
        <thead>
          <tr>
            <SortHeader sortKey="name" label="County" sort={sort} onSort={setSort} />
            <SortHeader sortKey="state" label="State" sort={sort} onSort={setSort} />
            <SortHeader sortKey="actual" label={target.label} sort={sort} onSort={setSort} />
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
                <td className="num">{actual !== null ? formatValue(actual, target.unit, d) : ""}</td>
                <td className="num">{predicted !== null ? formatValue(predicted, target.unit, d) : ""}</td>
                <td className="num">{residual !== null ? formatSigned(residual, target.unit, d) : ""}</td>
                <td>
                  <span className="table-tier">
                    {flag !== "insufficient_data" && (
                      <span
                        className="tier-swatch"
                        aria-hidden="true"
                        style={{ background: tierFill(flag, palette) }}
                      />
                    )}
                    {tierLabel(flag)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
