import { describe, expect, it } from "vitest";
import { model } from "../test/fixtures";
import { DEFAULT_TARGET, directionNote, targetModel } from "./targetView";

describe("targetModel", () => {
  it("returns the entry for the id", () => {
    expect(targetModel(model, "life_expectancy")).toBe(
      model.targets.life_expectancy,
    );
  });

  it("defaults to life expectancy", () => {
    expect(DEFAULT_TARGET).toBe("life_expectancy");
  });

  it("throws on an unknown id", () => {
    expect(() => targetModel(model, "nope")).toThrow("unknown target nope");
  });
});

describe("directionNote", () => {
  it("states the sign for a higher_is_worse target", () => {
    expect(directionNote(targetModel(model, "premature_death"))).toBe(
      "Higher is worse for this measure, so a positive difference means worse than expected.",
    );
  });

  it("is null for a higher_is_better target", () => {
    expect(directionNote(targetModel(model, "life_expectancy"))).toBeNull();
  });
});
