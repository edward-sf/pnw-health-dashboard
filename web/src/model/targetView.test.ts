import { describe, expect, it } from "vitest";
import { model } from "../test/fixtures";
import { DEFAULT_TARGET, directionNote, outcomeName, targetModel } from "./targetView";

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

describe("outcomeName", () => {
  it("lower-cases a label and drops a trailing parenthetical", () => {
    expect(outcomeName("Life expectancy")).toBe("life expectancy");
    expect(outcomeName("Premature death (years lost)")).toBe("premature death");
    expect(outcomeName("Injury deaths")).toBe("injury deaths");
  });
});
