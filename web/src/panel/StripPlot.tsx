import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useRef } from "react";
import { formatValue } from "../color/formatValue";
import type { Indicator, ValueEntry } from "../types";
import { buildStripData, type Point } from "./buildStripData";
import type { County } from "./CountyPanel";

type Props = {
  county: County;
  indicator: Indicator;
  entries: Record<string, ValueEntry>;
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
      height: 90,
      x: { label: null, tickFormat: (d: number) => formatValue(d, unit) },
      y: { axis: null },
      marks: [
        Plot.dot(
          points,
          Plot.dodgeY({
            x: "v",
            r: (d: Point) => (d.fips === selected?.fips ? 6 : 3),
            fill: (d: Point) => (d.fips === selected?.fips ? "#000" : "#9ca3af"),
            anchor: "middle",
          }),
        ),
      ],
    });
    el.replaceChildren(chart);
    return () => {
      chart.remove();
    };
  }, [points, selected, unit]);

  return (
    <section className="strip-plot">
      {points.length > 0 && <div ref={ref} className="strip-plot-chart" />}
      {nullCount > 0 && (
        <p className="strip-plot-missing">{nullCount} counties not shown (no data)</p>
      )}
      {selected && indicator.direction !== "neutral" && (
        <p className="visually-hidden">
          {county.name}: {formatValue(selected.v, unit)}. Higher than {below} of {points.length}{" "}
          counties with data.
        </p>
      )}
    </section>
  );
}
