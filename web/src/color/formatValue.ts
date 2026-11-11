import type { Unit } from "../types";

const fixed1 = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatTick(v: number, unit: Unit): string {
  const n = compact.format(v);
  if (unit === "dollars") return `$${n}`;
  if (unit === "percent") return `${n}%`;
  return n;
}

export function formatBound(v: number, unit: Unit): string {
  switch (unit) {
    case "percent":
    case "years":
    case "rate_per_100k":
      return fixed1(v);
    case "dollars":
      return `$${whole(v)}`;
    case "count":
      return whole(v);
  }
}

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
