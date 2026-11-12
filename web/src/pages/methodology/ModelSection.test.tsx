import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import {
  manifest,
  model as modelFile,
  lifeExpectancy as model,
  prematureDeath,
} from "../../test/fixtures";
import { formatCount } from "./format";
import { ModelSection } from "./ModelSection";

test("training, validation, metrics, importance and tiers", () => {
  render(
    <ModelSection
      model={modelFile}
      targetId="life_expectancy"
      onTargetChange={() => {}}
      indicators={manifest.indicators}
    />,
  );
  expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute("id", "model");
  const text = document.body.textContent ?? "";
  expect(text).toContain(`${formatCount(model.model_card.training_counties)} US counties`);
  expect(text).toContain(`${model.model_card.n_folds}-fold cross-validation`);
  expect(text).toContain("OutcomeLife expectancy");
  const table = screen.getByRole("table");
  const targets = Object.keys(modelFile.targets).length;
  // One row per target and model, each with a national and a PNW line.
  expect(within(table).getAllByText("Ridge baseline")).toHaveLength(2 * targets);
  expect(within(table).getAllByText("LightGBM")).toHaveLength(2 * targets);
  expect(within(table).getAllByRole("row")).toHaveLength(1 + 4 * targets);
  const ranked = within(screen.getByRole("list", { name: /Factors by importance/ }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
  expect(ranked[0]).toMatch(/^Bachelor's degree or higher/);
  expect(ranked[1]).toMatch(/^Poverty rate/);
  expect(ranked[3]).toMatch(/^unemployment_rate/);
  expect(text).toContain("z × √(σ_model² + se²)");
  expect(text).toContain("1.15");
  expect(text).toContain("1.64");
  expect(text).toContain("1.2 years");
  expect(text).toMatch(/positive difference means better than expected/i);
  expect(text).toMatch(/average se²/);
});

test("the no-result heading is a focusable deep-link target", () => {
  render(
    <ModelSection
      model={modelFile}
      targetId="life_expectancy"
      onTargetChange={() => {}}
      indicators={manifest.indicators}
    />,
  );
  const heading = screen.getByRole("heading", {
    level: 4,
    name: "Counties with no result",
  });
  expect(heading).toHaveAttribute("id", "no-result");
  expect(heading).toHaveAttribute("tabindex", "-1");
});

test("the outcome select is labelled, defaults to the given target and reports changes", async () => {
  const seen: string[] = [];
  render(
    <ModelSection
      model={modelFile}
      targetId="life_expectancy"
      onTargetChange={(id) => seen.push(id)}
      indicators={manifest.indicators}
    />,
  );
  const select = screen.getByRole("combobox", { name: "Outcome" });
  expect(select).toHaveValue("life_expectancy");
  expect(within(select).getAllByRole("option")).toHaveLength(Object.keys(modelFile.targets).length);
  await userEvent.setup().selectOptions(select, "premature_death");
  expect(seen).toEqual(["premature_death"]);
});

test("importance heading and unit follow the selected target", () => {
  render(
    <ModelSection
      model={modelFile}
      targetId="premature_death"
      onTargetChange={() => {}}
      indicators={manifest.indicators}
    />,
  );
  expect(
    screen.getByRole("heading", { level: 4, name: /Factors by importance/ }),
  ).toHaveTextContent("Premature death");
  const ranked = within(screen.getByRole("list", { name: /Factors by importance/ })).getAllByRole(
    "listitem",
  );
  expect(ranked[0]?.textContent).toMatch(/per 100k/);
  expect(ranked[0]?.textContent).not.toMatch(/years/);
  expect(document.body.textContent).toContain("600 per 100k");
});

test("says why PLACES outcomes and low birth weight are not targets, and how direction sets the sign", () => {
  render(
    <ModelSection
      model={modelFile}
      targetId="life_expectancy"
      onTargetChange={() => {}}
      indicators={manifest.indicators}
    />,
  );
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/PLACES outcomes .* not targets/);
  expect(text).toMatch(/partly from .*American Community Survey/);
  expect(text).toMatch(/low birth weight/i);
  expect(text).toMatch(/higher is worse.*a negative difference is better than expected/is);
  expect(text).toMatch(/blue for better than expected/);
});

const wording = (id: string) => {
  const { unmount } = render(
    <ModelSection model={modelFile} targetId={id} onTargetChange={() => {}} indicators={manifest.indicators} />,
  );
  const text = document.body.textContent ?? "";
  const section = text.slice(text.indexOf("Factors that stand in for others"));
  unmount();
  return { text, section };
};

test("the closing sections read correctly for every outcome", () => {
  const le = wording("life_expectancy").section;
  const pd = wording("premature_death").section;
  expect(le).toContain("why a county's actual value differs");
  expect(le).toContain("change life expectancy");
  expect(pd).toContain("why a county's actual value differs");
  expect(pd).toContain("change premature death");
  for (const section of [le, pd]) expect(section).not.toMatch(/lives tend to be longer/);
  expect(pd).not.toMatch(/life expectancy/i);
});

test("makes no claim the data can't support about the sources or intervals", () => {
  const { text } = wording("life_expectancy");
  expect(text).not.toMatch(/birth records/);
  expect(text).not.toMatch(/a confidence interval for each county/);
  expect(text).toMatch(/confidence interval for most counties/);
});

test("flag colours are blue and red, and low birth weight is explained plainly", () => {
  const { text } = wording("life_expectancy");
  expect(text).toMatch(/blue for better than expected and red for worse/);
  expect(text).not.toMatch(/orange/);
  expect(text).toMatch(/regional offset/);
  expect(text).not.toMatch(/review of the first results|because counties there sit/);
});

test("names the default outcome from DEFAULT_TARGET, not key order", () => {
  const reordered = { ...modelFile, targets: { premature_death: modelFile.targets.premature_death!, life_expectancy: modelFile.targets.life_expectancy! } };
  render(<ModelSection model={reordered} targetId="life_expectancy" onTargetChange={() => {}} indicators={manifest.indicators} />);
  expect(document.body.textContent).toContain("The default is life expectancy.");
});

test("the accuracy table puts each outcome's unit in the Outcome cell", () => {
  render(<ModelSection model={modelFile} targetId="life_expectancy" onTargetChange={() => {}} indicators={manifest.indicators} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByText("Life expectancy, years")).toHaveLength(4);
  expect(within(table).getAllByText("Premature death (years lost), per 100k")).toHaveLength(4);
});

test.each(["life_expectancy", "premature_death", "injury_deaths"])(
  "the associations paragraph reads for %s",
  (targetId) => {
    const injury = { ...prematureDeath, label: "Injury deaths" };
    const file = { ...modelFile, targets: { ...modelFile.targets, injury_deaths: injury } };
    render(
      <ModelSection
        model={file}
        targetId={targetId}
        onTargetChange={() => {}}
        indicators={manifest.indicators}
      />,
    );
    const heading = screen.getByRole("heading", { level: 4, name: "Associations, not effects" });
    const text = heading.nextElementSibling!.textContent!;
    expect(text).toContain("why a county's actual value differs from its expected value");
    expect(text).not.toContain("(");
    expect(text).not.toMatch(/deaths differs/);
  },
);
