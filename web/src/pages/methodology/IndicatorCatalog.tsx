import type { Direction, Indicator } from "../../types";
import { categoryLabel } from "../../explorer/categories";
import { sourceName } from "./SourcesSection";
import { Fold } from "./Fold";
import { joinList } from "./format";
import { TableScroll } from "./TableScroll";
import { SectionLayout } from "./SectionLayout";

const DIRECTIONS: Record<Direction, string> = {
  higher_is_better: "higher is more favorable",
  higher_is_worse: "lower is more favorable",
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
      <h4 id="indicators" tabIndex={-1}>
        Indicators
      </h4>
      <SectionLayout
        prose={
          <>
            <p>
              Each indicator has a direction. Where one end is more favorable, counties are ranked
              and colored so that the more favorable end reads the same way on every map. Indicators
              with no direction, such as population shares, are shown for context and not ranked.
            </p>
            {categories.map((category) => {
              const headingId = `indicators-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`;
              const members = indicators.filter((i) => i.category === category);
              return (
                <div key={category}>
                  <h5 id={headingId}>{categoryLabel(category)}</h5>
                  <p>Including {joinList(members.slice(0, 3).map((i) => i.label))}.</p>
                  <Fold summary={`Show all ${members.length} indicators`}>
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
                          {members.map((i) => (
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
                  </Fold>
                </div>
              );
            })}
          </>
        }
      />
    </section>
  );
}
