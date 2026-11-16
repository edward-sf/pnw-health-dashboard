import { expect, test } from "vitest";
import { deltaE76 } from "./deltaE";

test("deltaE76 is 0 for the same colour", () => expect(deltaE76("#2b6b55", "#2b6b55")).toBe(0));
test("deltaE76 matches a known pair", () => expect(deltaE76("#000000", "#ffffff")).toBeCloseTo(100, 0));
