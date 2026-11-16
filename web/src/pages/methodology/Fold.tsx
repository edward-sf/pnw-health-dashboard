import type { ReactNode } from "react";

/** A closed-by-default disclosure. Its children stay in the DOM, so find-in-page still reaches them. */
export function Fold({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="methodology-fold">
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
