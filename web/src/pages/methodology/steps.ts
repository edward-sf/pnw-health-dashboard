export type StepId = "fetch" | "harmonize" | "model-step" | "publish";
export type StepSection = { id: string; railLabel: string };
export type Step = { id: StepId; name: string; sections: StepSection[] };

export const FETCH: Step = {
  id: "fetch",
  name: "Fetch",
  sections: [
    { id: "sources", railLabel: "Sources and vintages" },
    { id: "indicators", railLabel: "Indicators" },
  ],
};

export const HARMONIZE: Step = {
  id: "harmonize",
  name: "Harmonize",
  sections: [
    { id: "harmonization", railLabel: "Geography" },
    { id: "missing-data", railLabel: "Missing and uncertain values" },
    { id: "race-breakdown", railLabel: "Outcomes by race and ethnicity" },
  ],
};

export const MODEL: Step = {
  id: "model-step",
  name: "Model",
  sections: [
    { id: "model", railLabel: "How it works" },
    { id: "exclusions", railLabel: "What it leaves out" },
    { id: "similar-counties", railLabel: "Similar counties" },
  ],
};

export const PUBLISH: Step = {
  id: "publish",
  name: "Publish",
  sections: [{ id: "model-card", railLabel: "Reproduce it" }],
};

export const STEPS: Step[] = [FETCH, HARMONIZE, MODEL, PUBLISH];

/** Every section id, flattened in page order. */
export const SECTION_IDS: string[] = STEPS.flatMap((s) => s.sections.map((x) => x.id));
