import type { ReactNode } from "react";

/** Prose on the left, an evidence box on the right from 721px; one column below and without evidence. */
export function SectionLayout({ prose, evidence }: { prose: ReactNode; evidence?: ReactNode }) {
  if (evidence === undefined) {
    return <div className="methodology-section">{prose}</div>;
  }
  return (
    <div className="methodology-section methodology-section--split">
      <div className="methodology-prose">{prose}</div>
      <div className="methodology-evidence">{evidence}</div>
    </div>
  );
}
