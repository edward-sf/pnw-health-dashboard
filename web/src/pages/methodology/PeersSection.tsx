import type { Indicator, Peers } from "../../types";
import { featureLabel, formatCount, joinList } from "./format";

export function PeersSection({ peers, indicators }: { peers: Peers; indicators: Indicator[] }) {
  const { features, k, min_features } = peers.method;
  const pool = Object.keys(peers.counties).length;
  return (
    <section aria-labelledby="similar-counties">
      <h3 id="similar-counties" tabIndex={-1}>
        Similar counties
      </h3>
      <p>
        A county's similar counties are the {k} nearest to it on {features.length} social and
        economic factors: {joinList(features.map((f) => featureLabel(f, indicators)))}. They are
        found only among the {formatCount(pool)} Pacific Northwest counties, never a county outside
        the Pacific Northwest. They don't depend on the outcome shown.
      </p>
      <p>
        Each factor is turned into z-scores across the Pacific Northwest counties, so all factors
        count equally, and the distance between two counties is the Euclidean distance between their
        z-scores. Ties are broken by FIPS code, so the result is the same every time.
      </p>
      <p>
        A county needs at least {min_features} of the {features.length} features to have similar
        counties, and a county with fewer is left out of the pool, so it is never anyone's similar
        county. For the others, a missing factor is filled with the median of the eligible Pacific
        Northwest counties before the z-scores are taken.
      </p>
      <p>
        Race and ethnicity shares are left out, for the same reason the model leaves them out, so
        similar counties never means counties with a similar racial make-up. Health behaviors and
        outcomes are left out too, so similar counties aren't defined by the measures the county
        panel compares across them. Being similar says nothing about why two counties differ.
      </p>
    </section>
  );
}
