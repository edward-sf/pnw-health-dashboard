import type { TargetModel } from "../../types";
import { Fold } from "./Fold";
import { formatCount } from "./format";
import { SectionLayout } from "./SectionLayout";

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
      <h4 id="model-card" tabIndex={-1}>
        Reproducibility
      </h4>
      <SectionLayout
        prose={
          <>
            <p>
              A pipeline rebuilds every data file from the sources, with pinned dependencies and
              fixed random seeds, so the same inputs give the same results.
            </p>
          </>
        }
        evidence={
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
        }
      />
      <h5>LightGBM parameters</h5>
      <Fold summary="Show the parameters">
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
      </Fold>
    </section>
  );
}
