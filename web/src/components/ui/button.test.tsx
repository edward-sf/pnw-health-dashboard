import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "./button";

test("primary is the filled accent", () => {
  render(<Button variant="primary">Go</Button>);
  expect(screen.getByRole("button", { name: "Go" }).className).toContain(
    "bg-primary",
  );
});

test("ghost has no border", () => {
  render(<Button variant="ghost">Go</Button>);
  expect(screen.getByRole("button", { name: "Go" }).className).not.toMatch(
    /\bborder\b/,
  );
});

test("secondary is the default and carries a border", () => {
  render(<Button>Go</Button>);
  const button = screen.getByRole("button", { name: "Go" });
  expect(button.dataset.variant).toBe("secondary");
  expect(button.className).toMatch(/\bborder\b/);
});

test("the icon size is at least 24 by 24", () => {
  render(<Button size="icon">X</Button>);
  const size = screen
    .getByRole("button")
    .className.split(/\s+/)
    .map((c) => /^size-(\d+)$/.exec(c))
    .find(Boolean);
  expect(Number(size?.[1])).toBeGreaterThanOrEqual(6);
});

test("a button rendered as a link is not underlined like body links", () => {
  render(
    <Button asChild variant="primary">
      <a href="/x">Source</a>
    </Button>,
  );
  expect(screen.getByRole("link", { name: "Source" }).className).toMatch(
    /\bno-underline\b/,
  );
});
