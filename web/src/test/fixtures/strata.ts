import type { StrataFile } from "../../types";

export const strata: StrataFile = {
  dimension: "race",
  source: "chr",
  year: 2025,
  groups: [
    { id: "white", label: "White" },
    { id: "black", label: "Black" },
    { id: "hispanic", label: "Hispanic" },
  ],
  indicators: {
    life_expectancy: {
      groups: ["white", "black", "hispanic"],
      counties: {
        "53033": {
          white: { v: 81.2, lo: 80.8, hi: 81.6 },
          black: { v: 77.9, lo: 76.5, hi: 79.3 },
          hispanic: { v: 84.1, lo: 82.0, hi: 86.2 },
        },
        "41051": {
          white: { v: 79.5, lo: 79.1, hi: 79.9 },
          black: { v: 74.0, lo: 70.2, hi: 77.8, unreliable: true },
          hispanic: null,
        },
        "16001": { white: null, black: null, hispanic: null },
      },
    },
    preventable_hospital_stays: {
      groups: ["white", "black", "hispanic"],
      counties: {
        "53033": {
          white: { v: 2100, lo: 2000, hi: 2200 },
          black: { v: 3400, lo: 3000, hi: 3800 },
          hispanic: { v: 1900, lo: 1700, hi: 2100 },
        },
        "41051": {
          white: { v: 2600, lo: 2500, hi: 2700 },
          black: { v: 3900, lo: 3100, hi: 4700, unreliable: true },
          hispanic: null,
        },
        "16001": { white: null, black: null, hispanic: null },
      },
    },
  },
};
