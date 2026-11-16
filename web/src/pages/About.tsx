import { Link } from "react-router";
import { GitHubIcon, LinkedInIcon } from "../brand/BrandIcons";
import { pageTitle } from "../brand/brand";
import { buttonVariants } from "@/components/ui/button";
import { usePageTitle } from "../hooks/usePageTitle";

const REPO = "https://github.com/edward-sf/pnw-health-dashboard";

type Panel = {
  title: string;
  description: string;
  stack: string[];
  proof: React.ReactNode;
};

const PANELS: Panel[] = [
  {
    title: "Data pipeline",
    description: "Fetches, harmonizes and exports county data from four public sources.",
    stack: ["Python 3.12", "uv", "pandas", "pytest"],
    proof: "Its output is checked against JSON Schemas that the site's types are generated from.",
  },
  {
    title: "Model",
    description: "Expected values for three outcomes, with factor attributions.",
    stack: ["LightGBM", "SHAP", "ridge baseline"],
    proof: (
      <Link to="/methodology#model-step">
        Cross-validated by state, with the weaker regional fit reported on the methodology page.
      </Link>
    ),
  },
  {
    title: "Site and delivery",
    description: "A map, table and county panel, accessible in both themes.",
    stack: ["React 19", "TypeScript", "Vite", "d3-geo", "Observable Plot", "Playwright"],
    proof:
      "End-to-end and accessibility tests run on every pull request. Changed tests are repeated under 4× CPU throttling to catch flakiness. GitHub Actions deploys the site.",
  },
  {
    title: "Agent workflow",
    description:
      "A small engine that runs each milestone as a graph of scripted checks and AI agent steps.",
    stack: ["Python", "Claude Code", "GitHub Actions"],
    proof: (
      <a href={`${REPO}/blob/main/workflow/README.md`}>
        Agents can merge only into milestone branches, never <code>main</code>. During a run, each
        merge needs passing gate and review records.
      </a>
    ),
  },
];

const SOURCES: [string, string][] = [
  ["CDC PLACES", "https://www.cdc.gov/places/"],
  ["County Health Rankings & Roadmaps", "https://www.countyhealthrankings.org/"],
  ["Census ACS", "https://www.census.gov/programs-surveys/acs"],
  [
    "Census cartographic boundary files",
    "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
  ],
];

export function About() {
  usePageTitle(pageTitle("About"));
  return (
    <section className="about">
      <h2 tabIndex={-1} data-page-heading>
        A public health atlas, built end to end
      </h2>
      <p className="about-lede">
        I built this to show how I take public data to a product people can read: the pipeline, the
        model, the site and the checks around all three.
      </p>
      <p className="about-actions">
        <a href={REPO} className={buttonVariants({ variant: "primary" })}>
          <GitHubIcon aria-hidden="true" />
          View the source on GitHub
        </a>
        <a
          href="https://www.linkedin.com/in/edward-sf"
          className={buttonVariants({ variant: "secondary" })}
        >
          <LinkedInIcon aria-hidden="true" />
          LinkedIn
        </a>
      </p>
      <p className="about-author">Edward Simpson-Fitzgibbon</p>

      <div className="about-panels">
        {PANELS.map((p) => (
          <article key={p.title} className="about-panel">
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <ul className="about-chips" aria-label={`${p.title} stack`}>
              {p.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="about-proof">{p.proof}</p>
          </article>
        ))}
      </div>

      <p className="about-explorer">
        <Link to="/">New to the explorer?</Link> Pick a measure, then select a county on the map or
        in the table.
      </p>

      <footer className="about-footer">
        <p>Data from:</p>
        <ul>
          {SOURCES.map(([name, href]) => (
            <li key={name}>
              <a href={href}>{name}</a>
            </li>
          ))}
        </ul>
        <p>This site is not affiliated with or endorsed by these organizations.</p>
        <p>The model shows associations, not causes. It is not medical advice or a forecast.</p>
        <p>
          Released under the <a href={`${REPO}/blob/main/LICENSE`}>MIT license</a>.
        </p>
      </footer>
    </section>
  );
}
