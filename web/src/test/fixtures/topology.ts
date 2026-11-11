import type { CountiesTopology } from "../../types";

// Unquantized arcs (no transform). Every ring is clockwise in lon/lat with
// north up, which is d3-geo's exterior-ring convention. Rings are small boxes
// placed over the named county; each is one closed arc.
const box = (w: number, s: number, e: number, n: number): [number, number][] => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
  [w, n],
];

export const topology: CountiesTopology = {
  type: "Topology",
  arcs: [
    box(-122.2, 47.3, -121.6, 47.7), // 0: King WA
    box(-122.8, 45.45, -122.2, 45.65), // 1: Multnomah OR
    box(-116.5, 43.4, -116.0, 43.7), // 2: Ada ID
    box(-176, 51.8, -175, 52), // 3: Aleutians West AK, west of the antimeridian
    box(178, 51.3, 179, 51.6), // 4: Aleutians West AK, east of the antimeridian
    box(-148, 60.5, -146.5, 61), // 5: Chugach AK
  ],
  objects: {
    counties: {
      type: "GeometryCollection",
      geometries: [
        {
          type: "Polygon",
          arcs: [[0]],
          properties: { fips: "53033", name: "King", state: "WA" },
        },
        {
          type: "Polygon",
          arcs: [[1]],
          properties: { fips: "41051", name: "Multnomah", state: "OR" },
        },
        {
          type: "Polygon",
          arcs: [[2]],
          properties: { fips: "16001", name: "Ada", state: "ID" },
        },
        {
          type: "MultiPolygon",
          arcs: [[[3]], [[4]]],
          properties: { fips: "02016", name: "Aleutians West", state: "AK" },
        },
        {
          type: "Polygon",
          arcs: [[5]],
          properties: { fips: "02063", name: "Chugach", state: "AK" },
        },
      ],
    },
  },
};
