/**
 * Maps values to a 0–100 (%) position on the race breakdown's shared axis. The domain is the
 * min to max of `values`, padded by 5% of the span on each side; a single distinct value maps to 50.
 */
export function breakdownScale(values: number[]): (x: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (!(span > 0)) return () => 50;
  const lo = min - span * 0.05;
  const width = span * 1.1;
  return (x) => ((x - lo) / width) * 100;
}
