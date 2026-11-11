import { TableScroll } from "./TableScroll";
import { formatCount, formatMetric, type MetricSet } from "./format";

type Row = { model: string; national: MetricSet; pnw: MetricSet };

const AREAS = [
  ["national", "United States"],
  ["pnw", "Pacific Northwest"],
] as const;

export function MetricsTable({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <TableScroll label={caption}>
      <table className="methodology-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Area</th>
            <th scope="col">R²</th>
            <th scope="col">RMSE</th>
            <th scope="col">MAE</th>
            <th scope="col">Counties</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) =>
            AREAS.map(([key, area]) => {
              const m = row[key];
              return (
                <tr key={`${row.model}-${key}`}>
                  <th scope="row">{row.model}</th>
                  <td>{area}</td>
                  <td className="num">{formatMetric(m.r2)}</td>
                  <td className="num">{formatMetric(m.rmse)}</td>
                  <td className="num">{formatMetric(m.mae)}</td>
                  <td className="num">{formatCount(m.n)}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}
