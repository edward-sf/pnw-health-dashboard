import type { ValuesFile } from "../../types";

export const values: ValuesFile = {
  poverty_rate: {
    "53033": { v: 9.5, lo: 9.1, hi: 9.9, rank: 2, state_rank: 2 },
    "41051": { v: 9.5, lo: 9.0, hi: 10.0, rank: 2, state_rank: 1 },
    "16001": { v: 0, lo: 0, hi: 0.4, rank: 5, state_rank: 1 },
    "02016": { v: 14.2, lo: 10.2, hi: 18.2, rank: 1, state_rank: 1 },
    "02063": {
      v: null,
      lo: null,
      hi: null,
      rank: null,
      state_rank: null,
      legacy: { fips: "02261", name: "Valdez-Cordova Census Area (former)", year: 2023, v: 8.1, lo: 6.0, hi: 10.2 },
    },
  },
  median_household_income: {
    "53033": { v: 120000, lo: 118000, hi: 122000, rank: 1, state_rank: 1 },
    "41051": { v: 85000, lo: 83500, hi: 86500, rank: 3, state_rank: 1 },
    "16001": { v: 90000, lo: 88000, hi: 92000, rank: 2, state_rank: 1 },
    "02016": { v: 60000, lo: 50000, hi: 70000, rank: 4, state_rank: 2 },
    "02063": { v: 70000, lo: 62000, hi: 78000, rank: 5, state_rank: 1 },
  },
  pct_asian: {
    "53033": { v: 22.1, lo: null, hi: null, rank: 1, state_rank: 1 },
    "41051": { v: 8.4, lo: null, hi: null, rank: 2, state_rank: 1 },
    "16001": { v: 3.2, lo: null, hi: null, rank: 4, state_rank: 1 },
    "02016": { v: 5.0, lo: null, hi: null, rank: 3, state_rank: 1 },
    "02063": { v: 1.5, lo: null, hi: null, rank: 5, state_rank: 2 },
  },
};
