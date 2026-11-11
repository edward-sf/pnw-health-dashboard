import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";
import type { ShapBar } from "../model/buildShapBars";

const NEUTRAL = "#6b7280";

export function ShapBars({ bars }: { bars: ShapBar[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    const chart = Plot.plot({
      width: 320,
      height: 28 * bars.length + 30,
      marginLeft: 8,
      marginRight: 8,
      marginTop: 4,
      marginBottom: 26,
      x: { label: "years", labelAnchor: "center", labelArrow: "none", ticks: 4, grid: false },
      y: { axis: null, domain: bars.map((b) => b.key) },
      marks: [
        Plot.ruleX([0], { stroke: NEUTRAL }),
        Plot.barX(bars, { x: "contribution", y: "key", fill: NEUTRAL }),
        Plot.text(bars, {
          x: 0,
          y: "key",
          text: "label",
          dy: -12,
          textAnchor: "start",
          frameAnchor: "left",
          fill: "#374151",
          fontSize: 11,
        }),
      ],
    });
    el.replaceChildren(chart);
    return () => {
      chart.remove();
    };
  }, [bars]);

  return (
    <>
      <div ref={ref} className="shap-bars-chart" aria-hidden="true" />
      <ul className="visually-hidden">
        {bars.map((b) => (
          <li key={b.key}>
            {b.label}: {b.contributionText}
          </li>
        ))}
      </ul>
    </>
  );
}
