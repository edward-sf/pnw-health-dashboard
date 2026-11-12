import { Link } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";

export function About() {
  usePageTitle("About · PNW Health Dashboard");
  return (
    <section className="about">
      <h2 tabIndex={-1} data-page-heading>
        About
      </h2>

      <h3>What this is</h3>
      <p>
        An explorer for county-level health and social indicators across Washington, Oregon, Idaho
        and Alaska. It also shows a model of three County Health Rankings outcomes (life expectancy by
        default, premature death and injury deaths), so you can compare each county's actual value
        with the value expected from its social and economic factors.
      </p>
      <p>
        Each county's panel also lists its similar counties, the nearest Pacific Northwest
        counties on social and economic factors, with their values side by side.
      </p>
      <p>
        The model shows associations, not causes. It is not medical advice or a forecast.
      </p>

      <h3>How to use it</h3>
      <ul>
        <li>Values mode colors the map by one indicator; model mode compares one of the three outcomes with its expected value.</li>
        <li>Switch between the map and a sortable table of the same counties.</li>
        <li>Search for a county by name, or select one on the map or in the table, to see its details.</li>
      </ul>
      <p>
        Caveats and sources are on the <Link to="/methodology">methodology</Link> page.
      </p>

      <h3>Built with</h3>
      <p>
        Python (uv, pandas, LightGBM, SHAP) for the data pipeline and model; React, Vite, d3-geo
        and Observable Plot for the site. GitHub Actions rebuilds the data and deploys the site to
        GitHub Pages.
      </p>

      <h3>Data credits</h3>
      <ul>
        <li>
          <a href="https://www.cdc.gov/places/">CDC PLACES</a>
        </li>
        <li>
          <a href="https://www.countyhealthrankings.org/">County Health Rankings &amp; Roadmaps</a>
        </li>
        <li>
          <a href="https://www.census.gov/programs-surveys/acs">Census ACS</a>
        </li>
        <li>
          <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html">
            Census cartographic boundary files
          </a>
        </li>
      </ul>
      <p>This site is not affiliated with or endorsed by these organizations.</p>

      <h3>Author</h3>
      <p>
        Edward Simpson-Fitzgibbon.{" "}
        <a href="https://github.com/edward-sf">GitHub</a>
        {" · "}
        <a href="https://www.linkedin.com/in/edward-sf">LinkedIn</a>
      </p>
      <p>
        <a href="https://github.com/edward-sf/pnw-health-dashboard">Source code</a> is available
        under the{" "}
        <a href="https://github.com/edward-sf/pnw-health-dashboard/blob/main/LICENSE">MIT license</a>.
      </p>
    </section>
  );
}
