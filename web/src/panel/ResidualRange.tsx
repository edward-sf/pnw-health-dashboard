import { formatBound, formatSigned, formatTick, formatValue } from "../color/formatValue";
import { usePalette } from "../color/palette";
import { type Direction, modelDigits, sideFlags, tierFill } from "../model/modelView";
import type { Flag, Unit } from "../types";

const W = 320;
const H = 54;
const LABEL_Y = 48;
/** Smallest gap between neighbouring labels, in viewBox units, before the inner pair is dropped. */
const MIN_LABEL_GAP = 28;

/** Axis labels: rates are compact ("10.1K") so neighbouring labels fit in the W-unit-wide viewBox. */
const signedBound = (v: number, unit: Unit) => {
  if (v === 0) return "0";
  const body = unit === "rate_per_100k" ? formatTick(Math.abs(v), unit) : formatBound(Math.abs(v), unit);
  return `${v > 0 ? "+" : "−"}${body}`;
};

/** Rough width of one axis character at fontSize 10, with room to spare. */
const CHAR_W = 6;

export function rangeDomain(residual: number, threshold90: number): number {
  return Math.max(threshold90, Math.abs(residual)) * 1.15;
}

export function rangeMeaning(
  residual: number,
  t75: number,
  t90: number,
  unit: Unit,
  note: string | null = null,
): string {
  const d = modelDigits(unit);
  const r = formatSigned(residual, unit, d);
  const a = formatValue(t75, unit, d);
  const b = formatValue(t90, unit, d);
  const text = baseMeaning(residual, r, a, b, t75, t90);
  return note ? `${text} ${note}` : text;
}

function baseMeaning(residual: number, r: string, a: string, b: string, t75: number, t90: number): string {
  const abs = Math.abs(residual);
  if (abs > t90) return `${r} is beyond ±${b}, the range for notably higher or lower.`;
  if (abs > t75) {
    return `${r} is beyond ±${a} but within ±${b}, somewhat higher or lower than expected.`;
  }
  return `${r} is within ±${a}, about as expected.`;
}

type Props = {
  residual: number;
  threshold75: number;
  threshold90: number;
  flag: Flag;
  unit: Unit;
  /** Which side of zero is less favorable, so the bands take the tier colours the map uses. */
  direction: Direction;
  note?: string | null;
};

export function ResidualRange({ residual, threshold75, threshold90, flag, unit, direction, note = null }: Props) {
  const palette = usePalette();
  const half = rangeDomain(residual, threshold90);
  const x = (v: number) => ((v + half) / (2 * half)) * W;
  const low = sideFlags("low", direction);
  const high = sideFlags("high", direction);
  // Five bands tile the axis: notably and somewhat on each side, about as expected in the middle.
  const bands: { key: string; from: number; to: number; flag: Flag }[] = [
    { key: "low-notably", from: -half, to: -threshold90, flag: low.notably },
    { key: "low-somewhat", from: -threshold90, to: -threshold75, flag: low.somewhat },
    { key: "none", from: -threshold75, to: threshold75, flag: "none" },
    { key: "high-somewhat", from: threshold75, to: threshold90, flag: high.somewhat },
    { key: "high-notably", from: threshold90, to: half, flag: high.notably },
  ];
  const labelW = (t: number) => signedBound(t, unit).length * CHAR_W;
  const needed = Math.max(MIN_LABEL_GAP, (labelW(threshold75) + labelW(threshold90)) / 2 + 2);
  const clearOfZero = x(threshold75) - x(0) >= (labelW(threshold75) + CHAR_W) / 2 + 2;
  const showInner = x(threshold90) - x(threshold75) >= needed && clearOfZero;
  const ticks = showInner
    ? [-threshold90, -threshold75, 0, threshold75, threshold90]
    : [-threshold90, 0, threshold90];
  return (
    <div className="residual-range">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        aria-hidden="true"
        focusable="false"
      >
        {bands.map((b) => (
          <rect
            key={b.key}
            data-band={b.key}
            className="range-band"
            x={x(b.from)}
            y={10}
            width={x(b.to) - x(b.from)}
            height={20}
            fill={tierFill(b.flag, palette)}
          />
        ))}
        <line className="range-zero" x1={x(0)} x2={x(0)} y1={6} y2={34} strokeWidth={1} />
        <circle
          className="range-dot"
          cx={x(residual)}
          cy={20}
          r={5}
          fill={tierFill(flag, palette)}
          stroke="var(--surface)"
          strokeWidth={2}
        />
        {ticks.map((t) => (
          <text
            key={t}
            className="range-label"
            x={x(t)}
            y={LABEL_Y}
            fontSize={10}
            textAnchor="middle"
          >
            {signedBound(t, unit)}
          </text>
        ))}
      </svg>
      <p className="visually-hidden">
        {rangeMeaning(residual, threshold75, threshold90, unit, note)}
      </p>
    </div>
  );
}
