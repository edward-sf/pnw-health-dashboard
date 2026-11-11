import { formatBound, formatSigned } from "../color/formatValue";
import { tierFill } from "../model/modelView";
import type { Flag } from "../types";

const W = 320;
const H = 40;

export function rangeDomain(residual: number, threshold90: number): number {
  return Math.max(threshold90, Math.abs(residual)) * 1.15;
}

export function rangeMeaning(residual: number, t75: number, t90: number): string {
  const r = formatSigned(residual, "years");
  const a = formatBound(t75, "years");
  const b = formatBound(t90, "years");
  const abs = Math.abs(residual);
  if (abs > t90) return `${r} is beyond the ±${b}-year range for notably better or worse.`;
  if (abs > t75) {
    return `${r} is beyond ±${a} but within ±${b} years, somewhat better or worse than expected.`;
  }
  return `${r} is within ±${a} years, about as expected.`;
}

type Props = { residual: number; threshold75: number; threshold90: number; flag: Flag };

export function ResidualRange({ residual, threshold75, threshold90, flag }: Props) {
  const half = rangeDomain(residual, threshold90);
  const x = (v: number) => ((v + half) / (2 * half)) * W;
  const band = (t: number) => ({ x: x(-t), width: x(t) - x(-t) });
  const b90 = band(threshold90);
  const b75 = band(threshold75);
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
      </svg>
      <p className="visually-hidden">
        {rangeMeaning(residual, threshold75, threshold90)}
      </p>
    </div>
  );
}
