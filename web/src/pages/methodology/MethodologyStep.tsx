import type { ReactNode } from "react";
import { STEPS, type Step } from "./steps";

export function MethodologyStep({
  step,
  index,
  children,
}: {
  step: Step;
  index: number;
  children: ReactNode;
}) {
  return (
    <section className="methodology-step" aria-labelledby={step.id}>
      <h3 id={step.id} tabIndex={-1} className="methodology-step-heading">
        <span className="methodology-step-count">
          Step {index + 1} of {STEPS.length}
        </span>{" "}
        {step.name}
      </h3>
      {children}
    </section>
  );
}
