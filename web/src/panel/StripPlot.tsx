import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useRef } from "react";
import { formatTick, formatValue } from "../color/formatValue";
import type { Indicator, Unit, ValueEntry } from "../types";
import { buildStripData } from "./buildStripData";
import type { County } from "../types";

type Props = {
  county: County;
  indicator: Indicator;
  entries: Record<string, ValueEntry>;
};

const AXIS_LABELS: Partial<Record<Unit, string>> = {
  years: "years",
  rate_per_100k: "per 100k",
};

export function StripPlot({ county, indicator, entries }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => buildStripData(entries, county.fips), [entries, county.fips]);
  const { points, nullCount, selected, below } = data;
  const unit = indicator.unit;

  useEffect(() => {
    const el = ref.current;
    if (!el || points.length === 0) return;
    const chart = Plot.plot({
      width: 320,
      height: 90,
      inset: 6,
      marginTop: 0,
      marginBottom: 38,
      x: {
        label: AXIS_LABELS[unit] ?? null,
        labelAnchor: "center",
        labelArrow: "none",
        labelOffset: 32,
        ticks: 4,
        tickFormat: (d: number) => formatTick(d, unit),
      },
      y: { axis: null, domain: [-1, 1] },
      marks: [
        Plot.dot(points, { x: "v", y: "jitter", r: 2.5, fill: "#9ca3af", fillOpacity: 0.6 }),
        Plot.dot(selected ? [selected] : [], { x: "v", y: "jitter", r: 5, fill: "#000" }),
      ],
    });
    el.replaceChildren(chart);
    return () => {
      chart.remove();
    };
  }, [points, selected, unit]);

  return (
    <section className="strip-plot" aria-label="Distribution across counties">
      {points.length > 0 && <div ref={ref} className="strip-plot-chart" aria-hidden="true" />}
      {nullCount > 0 && (
        <p className="strip-plot-missing">{nullCount} counties not shown (no data)</p>
      )}
      {selected && (
        <p className="visually-hidden">
          {county.name}: {formatValue(selected.v, unit)}. Higher than {below} of {points.length}{" "}
          counties with data.
        </p>
      )}
    </section>
  );
}
