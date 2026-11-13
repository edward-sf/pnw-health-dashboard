import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { manifest, strata } from "../test/fixtures";
import type { Indicator, ValueEntry } from "../types";
import { RaceBreakdown } from "./RaceBreakdown";

const lifeExpectancy = manifest.indicators.find((i) => i.id === "life_expectancy") as Indicator;
const overall: ValueEntry = {
  v: 80.4,
  lo: 80.1,
  hi: 80.7,
  rank: 1,
  state_rank: 1,
};

function setup(fips: string, entry: ValueEntry | "none" = overall, indicator = lifeExpectancy) {
  return render(
    <MemoryRouter>
      <RaceBreakdown
        indicator={indicator}
        fips={fips}
        overall={entry === "none" ? undefined : entry}
        strata={strata}
      />
    </MemoryRouter>,
  );
}

const section = () => screen.getByRole("region", { name: "By race and ethnicity (CHR 2025)" });
const rows = () => within(section()).getAllByRole("listitem");

it("renders heading 'By race and ethnicity (CHR 2025)' and a County overall row first", () => {
  setup("53033");
  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "By race and ethnicity (CHR 2025)",
    }),
  ).toBeInTheDocument();
  expect(rows()[0]).toHaveTextContent("County overall");
  expect(rows()[0]).toHaveTextContent("80.4 years");
  expect(rows()[0]).toHaveTextContent("95% CI 80.1–80.7");
});

it("lists only reported groups, in strata group order, with value and CI", () => {
  setup("41051");
  const r = rows();
  expect(r).toHaveLength(3);
  expect(r[1]).toHaveTextContent("White");
  expect(r[1]).toHaveTextContent("79.5 years");
  expect(r[1]).toHaveTextContent("95% CI 79.1–79.9");
  expect(r[2]).toHaveTextContent("Black");
  expect(r[2]).toHaveTextContent("74.0 years");
  expect(r[2]).toHaveTextContent("95% CI 70.2–77.8");
  expect(r.some((li) => li.textContent?.includes("Hispanic"))).toBe(false);
});

it("names unreported groups in one 'Not reported: …' line plus the explanation", () => {
  setup("41051");
  expect(within(section()).getByText("Not reported: Hispanic.")).toBeInTheDocument();
  expect(
    within(section()).getByText(
      "CHR does not report a group when there are too few cases to give a stable figure.",
    ),
  ).toBeInTheDocument();
});

it("all groups null: only the not-reported note, every group listed", () => {
  setup("16001");
  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "By race and ethnicity (CHR 2025)",
    }),
  ).toBeInTheDocument();
  expect(within(section()).queryAllByRole("listitem")).toHaveLength(0);
  expect(within(section()).queryByText(/County overall/)).toBeNull();
  expect(section().querySelector(".race-breakdown-mark")).toBeNull();
  expect(within(section()).getByText("Not reported: White, Black, Hispanic.")).toBeInTheDocument();
  expect(
    within(section()).getByText(
      "CHR does not report a group when there are too few cases to give a stable figure.",
    ),
  ).toBeInTheDocument();
});

it("group without CI shows value only, no interval text", () => {
  setup("02016");
  const white = rows()[1]!;
  expect(white).toHaveTextContent("White");
  expect(white).toHaveTextContent("76.0 years");
  expect(white).not.toHaveTextContent("CI");
  expect(white.querySelector(".race-breakdown-interval")).toBeNull();
  expect(white.querySelector(".race-breakdown-dot")).not.toBeNull();
  expect(rows()[2]).toHaveTextContent("95% CI 78.9–81.5");
});

it("overall suppressed: overall row reads 'Not available'; marks scale from groups", () => {
  setup("53033", { v: null, lo: null, hi: null, rank: null, state_rank: null });
  const r = rows();
  expect(r[0]).toHaveTextContent("County overall");
  expect(r[0]).toHaveTextContent("Not available");
  expect(r[0]!.querySelector(".race-breakdown-dot")).toBeNull();
  // Groups span 76.5 (Black lo) to 86.2 (Hispanic hi); padded 5% each side, both ends sit inside.
  const left = (el: Element | null) => parseFloat((el as HTMLElement).style.left);
  const blackInterval = r[2]!.querySelector(".race-breakdown-interval");
  const hispanicInterval = r[3]!.querySelector(".race-breakdown-interval") as HTMLElement;
  expect(left(blackInterval)).toBeCloseTo((0.05 / 1.1) * 100);
  expect(left(hispanicInterval) + parseFloat(hispanicInterval.style.width)).toBeCloseTo(
    (1.05 / 1.1) * 100,
  );
});

it("overall undefined also reads 'Not available'", () => {
  setup("53033", "none");
  expect(rows()[0]).toHaveTextContent("Not available");
});

it("unreliable group carries the unreliable marker", () => {
  setup("41051");
  expect(rows()[2]).toHaveTextContent(/\(unreliable\)$/);
  expect(rows()[1]).not.toHaveTextContent("unreliable");
  expect(
    within(section()).getByText(/CHR marks some figures as unreliable; read them with caution\./),
  ).toBeInTheDocument();
  expect(within(section()).getByRole("link", { name: "Methodology" })).toHaveAttribute(
    "href",
    "/methodology#unreliable",
  );
});

it("no unreliable note when every row is reliable", () => {
  setup("53033");
  expect(within(section()).queryByText(/unreliable/)).toBeNull();
});

it("marks are hidden from assistive technology", () => {
  setup("53033");
  const marks = section().querySelectorAll(".race-breakdown-mark");
  expect(marks.length).toBe(4);
  marks.forEach((m) => expect(m).toHaveAttribute("aria-hidden", "true"));
});

it("renders nothing for an indicator without strata", () => {
  const poverty = manifest.indicators.find((i) => i.id === "poverty_rate") as Indicator;
  const { container } = setup("53033", overall, poverty);
  expect(container).toBeEmptyDOMElement();
});

it("a measure's label override replaces the group label in rows and the not-reported line", () => {
  const base = strata.indicators.life_expectancy!;
  const overridden = {
    ...strata,
    indicators: {
      ...strata.indicators,
      life_expectancy: {
        ...base,
        labels: { black: "Black (override)", hispanic: "Hispanic (override)" },
      },
    },
  };
  render(
    <MemoryRouter>
      <RaceBreakdown indicator={lifeExpectancy} fips="41051" overall={overall} strata={overridden} />
    </MemoryRouter>,
  );
  expect(rows()[2]).toHaveTextContent("Black (override)");
  expect(rows()[1]).toHaveTextContent("White");
  expect(within(section()).getByText("Not reported: Hispanic (override).")).toBeInTheDocument();
});

it("legacy-area county: says CHR reports no figures here, not the too-few-cases sentence", () => {
  setup("16001", {
    v: null,
    lo: null,
    hi: null,
    rank: null,
    state_rank: null,
    legacy: { fips: "02261", name: "Valdez-Cordova", year: 2023, v: 75, lo: 74, hi: 76 },
  });
  expect(within(section()).getByText("Not reported: White, Black, Hispanic.")).toBeInTheDocument();
  expect(within(section()).getByText("CHR 2025 reports no figures for this area.")).toBeInTheDocument();
  expect(within(section()).queryByText(/too few cases/)).toBeNull();
});
