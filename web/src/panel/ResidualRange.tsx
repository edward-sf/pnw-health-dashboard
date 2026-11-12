import { formatBound, formatSigned, formatTick, formatValue } from "../color/formatValue";
import { modelDigits, tierFill } from "../model/modelView";
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
  if (abs > t90) return `${r} is beyond ±${b}, the range for notably better or worse.`;
  if (abs > t75) {
    return `${r} is beyond ±${a} but within ±${b}, somewhat better or worse than expected.`;
  }
  return `${r} is within ±${a}, about as expected.`;
}

type Props = { residual: number; threshold75: number; threshold90: number; flag: Flag; unit: Unit; note?: string | null };

export function ResidualRange({ residual, threshold75, threshold90, flag, unit, note = null }: Props) {
  const half = rangeDomain(residual, threshold90);
  const x = (v: number) => ((v + half) / (2 * half)) * W;
  const band = (t: number) => ({ x: x(-t), width: x(t) - x(-t) });
  const b90 = band(threshold90);
  const b75 = band(threshold75);
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
        <rect x={b90.x} y={10} width={b90.width} height={20} fill="#c9ced6" />
        <rect x={b75.x} y={10} width={b75.width} height={20} fill="#e6e9ee" />
        <line x1={x(0)} x2={x(0)} y1={6} y2={34} stroke="#374151" strokeWidth={1} />
        <circle cx={x(residual)} cy={20} r={5} fill={tierFill(flag)} stroke="#111" strokeWidth={1} />
        {ticks.map((t) => (
          <text
            key={t}
            className="range-label"
            x={x(t)}
            y={LABEL_Y}
            fontSize={10}
            fill="#4b5563"
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
