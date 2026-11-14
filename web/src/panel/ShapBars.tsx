import type { ShapBar } from "../model/buildShapBars";

const W = 320;
const ZERO_X = W / 2;
const HALF = 80;
const ROW = 38;
const LABEL_Y = 12;
const BAR_Y = 18;
const BAR_H = 14;
const CHAR_W = 5.6;

/** Neutral bars, one per factor; their colors are chart tokens set by class in styles.css. */
export function ShapBars({ bars }: { bars: ShapBar[] }) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => Math.abs(b.contribution)), 1e-9);
  const height = bars.length * ROW + 4;
  return (
    <>
      <svg
        className="shap-bars-chart"
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        height={height}
        aria-hidden="true"
        focusable="false"
      >
        {bars.map((b, i) => {
          const top = i * ROW;
          const len = (Math.abs(b.contribution) / max) * HALF;
          const positive = b.contribution >= 0;
          const x = positive ? ZERO_X : ZERO_X - len;
          const tooLong = b.label.length * CHAR_W > W - 4;
          return (
            <g key={b.key} data-key={b.key}>
              <text
                x={0}
                y={top + LABEL_Y}
                className="shap-label"
                fontSize={11}
                {...(tooLong ? { textLength: W - 4, lengthAdjust: "spacingAndGlyphs" } : {})}
              >
                {b.label}
              </text>
              <line
                className="shap-zero"
                x1={ZERO_X}
                x2={ZERO_X}
                y1={top + BAR_Y - 2}
                y2={top + BAR_Y + BAR_H + 2}
                strokeWidth={1}
              />
              <rect
                className="shap-bar"
                x={x}
                y={top + BAR_Y}
                width={len}
                height={BAR_H}
              />
              <text
                className="shap-value"
                x={positive ? ZERO_X + len + 4 : ZERO_X - len - 4}
                y={top + BAR_Y + 11}
                fontSize={11}
                textAnchor={positive ? "start" : "end"}
              >
                {b.contributionText}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="visually-hidden">
        {bars.map((b) => (
          <li key={b.key}>
            {b.label}, {b.contributionText}
          </li>
        ))}
      </ul>
    </>
  );
}
