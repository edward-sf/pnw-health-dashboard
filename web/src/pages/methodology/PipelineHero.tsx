import { Link } from "react-router";
import type { AppData } from "../../data/loadData";
import { formatCount, formatMetric } from "./format";
import { pipelineFigures } from "./pipelineFigures";
import { FETCH, HARMONIZE, MODEL, PUBLISH } from "./steps";

export function PipelineHero({ data }: { data: AppData }) {
  const f = pipelineFigures(data);
  const items = [
    {
      step: FETCH,
      figure: formatCount(f.sources),
      label: "public sources",
      description: "ACS, CDC PLACES, County Health Rankings, boundaries",
    },
    {
      step: HARMONIZE,
      figure: formatCount(f.counties),
      label: "counties",
      description: "Boundary changes, missing and uncertain values",
    },
    {
      step: MODEL,
      figure: formatMetric(f.pnwR2),
      label: "R² in the region",
      description: `${f.outcomes} outcomes, cross-validated by state`,
    },
    {
      step: PUBLISH,
      figure: "5",
      label: "data files",
      description: "Checked against a schema, rebuilt by CI",
    },
  ];
  return (
    <>
      <p className="pipeline-lede">
        Public data for every US county, narrowed to {formatCount(f.counties)} in the Pacific
        Northwest, and a model tested on states it never saw.
      </p>
      <nav aria-label="Pipeline steps">
        <ul className="pipeline-strip">
          {items.map(({ step, figure, label, description }) => (
            <li key={step.id} className="pipeline-step">
              <Link to={{ hash: step.id }} className="pipeline-link">
                <span className="pipeline-figure">{figure}</span>
                <span className="pipeline-label">{label}</span>
                <span className="pipeline-name">{step.name}</span>
                <span className="pipeline-desc">{description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
