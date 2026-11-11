import type { Direction, Indicator } from "../../types";
import { sourceName } from "./SourcesSection";
import { TableScroll } from "./TableScroll";

const DIRECTIONS: Record<Direction, string> = {
  higher_is_better: "higher is better",
  higher_is_worse: "higher is worse",
  neutral: "no direction",
};

const ORDER: Indicator["category"][] = [
  "Outcomes",
  "Behaviors",
  "Access",
  "Social & Economic",
  "Demographics",
];

function sourceAndYear({ source, year }: Indicator): string {
  return `${sourceName(source)}, ${year}${source === "chr" ? " release" : ""}`;
}

export function IndicatorCatalog({ indicators }: { indicators: Indicator[] }) {
  const categories = [
    ...ORDER.filter((c) => indicators.some((i) => i.category === c)),
    ...new Set(indicators.map((i) => i.category).filter((c) => !ORDER.includes(c))),
  ];
  return (
    <section aria-labelledby="indicators">
      <h3 id="indicators" tabIndex={-1}>
        Indicators
      </h3>
      <p>
        Each indicator has a direction. Where higher is better or worse, counties are ranked and
        colored so that better reads the same way on every map. Indicators with no direction, such
        as population shares, are shown for context and not ranked.
      </p>
      {categories.map((category) => {
        const headingId = `indicators-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        return (
          <div key={category}>
            <h4 id={headingId}>{category}</h4>
            <TableScroll labelledBy={headingId}>
              <table className="methodology-table" aria-labelledby={headingId}>
                <thead>
                  <tr>
                    <th scope="col">Indicator</th>
                    <th scope="col">Source</th>
                    <th scope="col">Direction</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators
                    .filter((i) => i.category === category)
                    .map((i) => (
                      <tr key={i.id}>
                        <th scope="row">{i.label}</th>
                        <td>{sourceAndYear(i)}</td>
                        <td>{DIRECTIONS[i.direction] ?? i.direction}</td>
                        <td>{i.description}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        );
      })}
    </section>
  );
}
