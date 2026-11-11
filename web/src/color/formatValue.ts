import type { Unit } from "../types";

const fixed1 = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function formatValue(v: number | null, unit: Unit): string {
  if (v === null) return "Suppressed or not available";
  switch (unit) {
    case "percent":
      return `${fixed1(v)}%`;
    case "dollars":
      return `$${whole(v)}`;
    case "years":
      return `${fixed1(v)} years`;
    case "rate_per_100k":
      return `${fixed1(v)} per 100k`;
    case "count":
      return whole(v);
  }
}
