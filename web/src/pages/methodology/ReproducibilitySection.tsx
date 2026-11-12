import type { TargetModel } from "../../types";
import { formatCount } from "./format";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
}

export function ReproducibilitySection({
  model,
  builtAt,
}: {
  model: TargetModel;
  builtAt: string;
}) {
  const card = model.model_card;
  return (
    <section aria-labelledby="model-card">
      <h3 id="model-card" tabIndex={-1}>
        Reproducibility
      </h3>
      <p>
        A pipeline rebuilds every data file from the sources, with pinned dependencies and fixed
        random seeds, so the same inputs give the same results.
      </p>
      <dl className="methodology-dl">
        <dt>Outcome</dt>
        <dd>{model.label}</dd>
        <dt>Training counties</dt>
        <dd>{formatCount(card.training_counties)}</dd>
        <dt>Random seed</dt>
        <dd>{card.seed}</dd>
        <dt>Cross-validation folds</dt>
        <dd>{card.n_folds}</dd>
        <dt>LightGBM version</dt>
        <dd>{card.lightgbm_version}</dd>
        <dt>Data built</dt>
        <dd>{formatDate(builtAt)}</dd>
      </dl>
      <h4>LightGBM parameters</h4>
      <dl className="methodology-dl">
        {Object.entries(card.lightgbm_params).map(([key, value]) => (
          <div key={key}>
            <dt>
              <code>{key}</code>
            </dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
