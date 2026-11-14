import type { Extent } from "./buildMapPaths";

export type Ring = [number, number][];
export type Shape = { rings: Ring[]; bounds: Extent; area: number };
export type PlacedPad = { index: number; pad: Extent };

/**
 * Places invisible hit pads so every county can be reached over a box at least `min` on each
 * side, taking as little as possible from other counties.
 *
 * The canvas is rasterised at one cell per canvas unit into the county that owns each cell.
 * Counties short of `min` on a side are padded first, smallest first; then any county left short
 * by those pads gets one too. A pad is a `min` × `min` square, slid a unit at a time over every
 * position that covers the county's extent on a short side and stays within it on a long one,
 * and placed where it takes the fewest cells from other counties while keeping a reachable cell
 * on each of its edges.
 * A pad never counts on cells an earlier pad took, because the earlier pad is drawn above it.
 *
 * Returns the pads in drawing order, bottom first.
 */
const SHORT_WEIGHT = 8;

export function placePads(shapes: Shape[], width: number, height: number, min: number): PlacedPad[] {
  const W = Math.ceil(width);
  const H = Math.ceil(height);
  const owner = new Int16Array(W * H).fill(-1);
  shapes.forEach((s, i) => rasterise(s, i, owner, W, H));
  const claimed = new Int16Array(W * H).fill(-1);
  const placed: PlacedPad[] = [];
  const isShort = shapes.map(({ bounds: [[x0, y0], [x1, y1]] }) => Math.min(x1 - x0, y1 - y0) < min);

  /** Cell range [x0, y0, x1, y1) of a rectangle, clipped to the canvas. */
  const cells = ([[x0, y0], [x1, y1]]: Extent): [number, number, number, number] => [
    clamp(Math.round(x0), W),
    clamp(Math.round(y0), H),
    clamp(Math.round(x1), W),
    clamp(Math.round(y1), H),
  ];

  type Box = [number, number, number, number];
  const EMPTY: Box = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (b: Box, x: number, y: number) => {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x + 1);
    b[3] = Math.max(b[3], y + 1);
  };
  const size = (b: Box): [number, number] => (b[2] < b[0] ? [0, 0] : [b[2] - b[0], b[3] - b[1]]);
  const mine = (x: number, y: number, i: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const c = y * W + x;
    return claimed[c] === i || (claimed[c] === -1 && owner[c] === i);
  };
  // A cell counts toward a county's reach only as part of a 2×2 block it can be reached on, so a
  // one-cell gap between two pads (under a pixel on screen) is not counted as reachable.
  const solid = (x: number, y: number, ok: (x: number, y: number) => boolean) =>
    ok(x, y) && ok(x + 1, y) && ok(x, y + 1) && ok(x + 1, y + 1);

  /** The box of cells county `i` can still be reached on, without a new pad. */
  const reachBox = (i: number): Box => {
    const [[bx0, by0], [bx1, by1]] = shapes[i]!.bounds;
    const [x0, y0, x1, y1] = cells([
      [bx0 - min, by0 - min],
      [bx1 + min, by1 + min],
    ]);
    const box: Box = [...EMPTY];
    const ok = (x: number, y: number) => mine(x, y, i);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (solid(x, y, ok)) {
          grow(box, x, y);
          grow(box, x + 1, y + 1);
        }
      }
    }
    return box;
  };

  /** Cells a pad at `rect` takes from other counties (a short county's cost more: it needs them
   *  for its own reach), plus a large penalty for each unit the county's reach would still fall
   *  short of `min`; of two equal places, the one over more of the county's own cells. */
  const cost = (i: number, rect: Extent, own: Box) => {
    const [x0, y0, x1, y1] = cells(rect);
    const box: Box = [...own];
    // Inside the pad a cell is free unless an earlier pad took it; outside, only the county's own.
    const free = (x: number, y: number) =>
      x < x1 && y < y1 ? claimed[y * W + x] === -1 || claimed[y * W + x] === i : mine(x, y, i);
    let taken = 0;
    let overOwn = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const c = y * W + x;
        if (claimed[c] !== -1 && claimed[c] !== i) continue;
        // Only a cell that would widen the box needs the 2×2 test.
        const widens = x < box[0] || y < box[1] || x + 2 > box[2] || y + 2 > box[3];
        if (widens && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) {
          grow(box, x, y);
          grow(box, x + 1, y + 1);
        }
        if (owner[c] === i) overOwn++;
        else if (owner[c] !== -1 && claimed[c] !== i) taken += isShort[owner[c]!] ? SHORT_WEIGHT : 1;
      }
    }
    const [w, h] = size(box);
    const shortfall = Math.max(0, min - w) + Math.max(0, min - h);
    return taken + shortfall * 1e6 - overOwn / 1e4;
  };

  const pad = (i: number) => {
    const [[bx0, by0], [bx1, by1]] = shapes[i]!.bounds;
    const own = reachBox(i);
    const search = (along: (lo: number, hi: number) => number[]) => {
      let best: { cost: number; rect: Extent } | null = null;
      for (const x of along(bx0, bx1)) {
        for (const y of along(by0, by1)) {
          const rect: Extent = [
            [x, y],
            [x + min, y + min],
          ];
          const c = cost(i, rect, own);
          if (!best || c < best.cost) best = { cost: c, rect };
        }
      }
      return best!;
    };
    // First, squares that cover the county's extent on a short side and stay within it on a long
    // one. If none of those reaches the minimum, any square that overlaps the county's box. Both
    // try places two units (under 2px) apart, which keeps this to tens of milliseconds.
    let best = search((lo, hi) => (hi - lo < min ? steps(hi - min, lo, 2) : steps(lo, hi - min, 2)));
    if (best.cost >= 1e6) {
      const wider = search((lo, hi) => steps(lo - min + 1, hi - 1, 2));
      if (wider.cost < best.cost) best = wider;
    }
    const [x0, y0, x1, y1] = cells(best.rect);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (claimed[y * W + x] === -1) claimed[y * W + x] = i;
    }
    placed.push({ index: i, pad: best.rect });
  };

  const bySize = (a: number, b: number) => shapes[a]!.area - shapes[b]!.area;
  const all = shapes.map((_, i) => i);
  const short = all.filter((i) => isShort[i]);
  for (const i of short.sort(bySize)) pad(i);
  const padded = new Set(short);
  const leftShort = all.filter((i) => !padded.has(i) && Math.min(...size(reachBox(i))) < min);
  for (const i of leftShort.sort(bySize)) pad(i);

  return placed.reverse();
}

function clamp(n: number, hi: number) {
  return Math.min(Math.max(n, 0), hi);
}

/** `from`, `to`, and the whole units between them, `stride` apart. */
function steps(from: number, to: number, stride = 1): number[] {
  const out = [from];
  for (let v = Math.floor(from) + stride; v < to; v += stride) out.push(v);
  if (to > from) out.push(to);
  return out;
}

/** Marks the cells whose centres lie inside the shape's rings (even-odd) as county `i`. */
function rasterise({ rings, bounds }: Shape, i: number, owner: Int16Array, W: number, H: number) {
  const [[, by0], [, by1]] = bounds;
  for (let y = Math.max(0, Math.floor(by0)); y < Math.min(H, Math.ceil(by1)); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k]!;
        const [bx, by] = ring[(k + 1) % ring.length]!;
        if (ay <= yc !== by <= yc) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const to = Math.min(W - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = from; x <= to; x++) owner[y * W + x] = i;
    }
  }
}
