import { describe, expect, it } from "vitest";
import { model } from "../test/fixtures";
import { DEFAULT_TARGET, targetModel } from "./targetView";

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
