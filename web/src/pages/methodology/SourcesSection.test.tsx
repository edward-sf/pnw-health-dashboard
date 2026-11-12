import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest } from "../../test/fixtures";
import { SourcesSection } from "./SourcesSection";

test("one row per manifest source, with the CHR legacy row labelled", () => {
  render(<SourcesSection sources={manifest.sources} />);
  expect(screen.getByRole("heading", { level: 3, name: "Sources and vintages" })).toHaveAttribute(
    "id",
    "sources",
  );
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(manifest.sources.length);
  expect(screen.getByRole("link", { name: "CDC PLACES" })).toHaveAttribute(
    "href",
    "https://example.test/places",
  );
  const legacy = rows.find((r) => r.textContent?.includes("2023") && r.textContent.includes("County Health"));
  expect(legacy).toHaveTextContent("(legacy values for the former Valdez-Cordova Census Area)");
  const current = rows.find((r) => r.textContent?.includes("2025") && r.textContent.includes("County Health"));
  expect(current).not.toHaveTextContent(/legacy/);
  expect(screen.getByText(/CDC WONDER/)).toBeInTheDocument();
});

test("an unknown source id is shown raw", () => {
  render(
    <SourcesSection sources={[{ source: "mystery", year: 2024, url: "https://example.test/m" }]} />,
  );
  expect(screen.getByRole("link", { name: "mystery" })).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("undefined");
});

test("the County Health Rankings row names all three outcomes", () => {
  render(<SourcesSection sources={manifest.sources} />);
  const row = within(screen.getByRole("table"))
    .getAllByRole("row")
    .find((r) => r.textContent?.includes("2025") && r.textContent.includes("County Health"))!;
  expect(row).toHaveTextContent(
    "The model's three outcomes (life expectancy, premature death and injury deaths)",
  );
});
