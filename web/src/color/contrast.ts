const HEX = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

/** True for a `#rrggbb` colour, the only form `contrastRatio` accepts. */
export const isHexColor = (color: string): boolean => HEX.test(color);

function luminance(color: string): number {
  const m = HEX.exec(color);
  if (!m) throw new Error(`expected a #rrggbb colour, got "${color}"`);
  const [r, g, b] = m.slice(1, 4).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
