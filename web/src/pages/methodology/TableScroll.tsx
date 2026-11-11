import type { ReactNode } from "react";

type Props = { children: ReactNode } & (
  | { label: string; labelledBy?: never }
  | { labelledBy: string; label?: never }
);

/**
 * A horizontally scrolling table wrapper that keyboard users can focus and scroll, named after
 * its table so the extra tab stop is announced (axe `scrollable-region-focusable`).
 */
export function TableScroll({ label, labelledBy, children }: Props) {
  return (
    <div
      className="methodology-table-wrap"
      role="region"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
