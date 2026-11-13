import type { Unit } from "../types";

const fixed = (v: number, digits: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fixed1 = (v: number) => fixed(v, 1);
const whole = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatTick(v: number, unit: Unit): string {
  const n = compact.format(v);
  if (unit === "dollars") return `$${n}`;
  if (unit === "percent") return `${n}%`;
  return n;
}

export function formatBound(v: number, unit: Unit, digits?: number): string {
  switch (unit) {
    case "percent":
    case "years":
    case "rate_per_100k":
      return digits === undefined ? fixed1(v) : fixed(v, digits);
    case "dollars":
      return `$${digits === undefined ? whole(v) : fixed(v, digits)}`;
    case "count":
      return digits === undefined ? whole(v) : fixed(v, digits);
  }
}

/** The panel's interval text, such as "95% CI 73.8–74.6", or null without both bounds and a level. */
export function formatCi(
  lo: number | null,
  hi: number | null,
  indicator: { unit: Unit; ci_level: number | null },
): string | null {
  if (lo === null || hi === null || indicator.ci_level === null) return null;
  const { unit } = indicator;
  return `${Math.round(indicator.ci_level * 100)}% CI ${formatBound(lo, unit)}–${formatBound(hi, unit)}`;
}

const SUFFIX: Record<Unit, string> = {
  percent: "%",
  years: " years",
  rate_per_100k: " per 100k",
  dollars: "",
  count: "",
};

export function formatValue(v: number | null, unit: Unit, digits?: number): string {
  if (v === null) return "Suppressed or not available";
  return `${formatBound(v, unit, digits)}${SUFFIX[unit]}`;
}

/**
 * Signed value with + or the true minus (U+2212), and no sign when it rounds to zero.
 * Without `digits` it uses the unit's own digits, as `formatBound` does. NaN and ±Infinity
 * read "Not available" rather than as an unsigned zero.
 */
export function formatSigned(v: number, unit: Unit, digits?: number): string {
  if (!Number.isFinite(v)) return "Not available";
  const body = formatBound(Math.abs(v), unit, digits);
  const isZero = Number(body.replace(/[^0-9.]/g, "")) === 0;
  const sign = isZero ? "" : v > 0 ? "+" : "−";
  return `${sign}${body}${SUFFIX[unit]}`;
}
