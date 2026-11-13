import { useId } from "react";
import { Link } from "react-router";
import { formatCi, formatValue } from "../color/formatValue";
import type { Indicator, StrataFile, ValueEntry } from "../types";
import { breakdownScale } from "./breakdownScale";

type Props = {
  indicator: Indicator;
  fips: string;
  /** The county's overall value from values.json, shown first for comparison. */
  overall: ValueEntry | undefined;
  strata: StrataFile;
};

type Row = {
  key: string;
  label: string;
  v: number | null;
  lo: number | null;
  hi: number | null;
  unreliable: boolean;
};

/** CHR outcomes by race and ethnicity for one county (M10 spec §5.2). Never ranked or colored. */
export function RaceBreakdown({ indicator, fips, overall, strata }: Props) {
  const headingId = useId();
  const stratum = strata.indicators[indicator.id];
  if (!stratum) return null;

  const byGroup = stratum.counties[fips] ?? {};
  const listed = strata.groups.filter((g) => stratum.groups.includes(g.id));
  const groupRows: Row[] = [];
  const notReported: string[] = [];
  for (const g of listed) {
    const e = byGroup[g.id];
    if (e) {
      groupRows.push({ key: g.id, label: g.label, v: e.v, lo: e.lo, hi: e.hi, unreliable: !!e.unreliable });
    } else {
      notReported.push(g.label);
    }
  }
  const rows: Row[] = [
    {
      key: "overall",
      label: "County overall",
      v: overall?.v ?? null,
      lo: overall?.lo ?? null,
      hi: overall?.hi ?? null,
      unreliable: !!overall?.unreliable,
    },
    ...groupRows,
  ];

  const domain = rows.flatMap((r) =>
    r.v === null ? [] : [r.v, r.lo, r.hi].filter((x): x is number => x !== null),
  );
  const x = domain.length > 0 ? breakdownScale(domain) : null;
  const anyUnreliable = rows.some((r) => r.v !== null && r.unreliable);

  return (
    <section className="race-breakdown" aria-labelledby={headingId}>
      <h3 id={headingId}>By race and ethnicity (CHR {strata.year})</h3>
      <ul className="race-breakdown-rows">
        {rows.map((r) => {
          const ci = r.v === null ? null : formatCi(r.lo, r.hi, indicator);
          return (
            <li key={r.key} className="race-breakdown-row">
              <span className="race-breakdown-text">
                <span className="race-breakdown-label">{r.label}</span>{" "}
                <span className="race-breakdown-value">
                  {r.v === null ? "Not available" : formatValue(r.v, indicator.unit)}
                </span>
                {ci && <span className="race-breakdown-ci"> {ci}</span>}
                {r.v !== null && r.unreliable && " (unreliable)"}
              </span>
              <span className="race-breakdown-mark" aria-hidden="true">
                {x && r.v !== null && (
                  <>
                    {r.lo !== null && r.hi !== null && (
                      <span
                        className="race-breakdown-interval"
                        style={{ left: `${x(r.lo)}%`, width: `${x(r.hi) - x(r.lo)}%` }}
                      />
                    )}
                    <span className="race-breakdown-dot" style={{ left: `${x(r.v)}%` }} />
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {notReported.length > 0 && (
        <>
          <p className="race-breakdown-note">Not reported: {notReported.join(", ")}.</p>
          <p className="race-breakdown-note">
            CHR does not report a group when there are too few births or deaths to give a stable
            figure.
          </p>
        </>
      )}
      {anyUnreliable && (
        <p className="race-breakdown-note">
          CHR marks some figures as unreliable; read them with caution.{" "}
          <Link to="/methodology#unreliable">Methodology</Link>
        </p>
      )}
    </section>
  );
}
