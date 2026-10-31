import { describe, expect, it } from "vitest";
import { nextIntakeYear } from "./next-intake";

describe("nextIntakeYear", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  it("moves on from the planned intake", () => {
    expect(nextIntakeYear(2027, [], now)).toBe(2028);
  });
  it("moves past the intakes the student was turned down for", () => {
    expect(nextIntakeYear(null, [2027, 2027], now)).toBe(2028);
    expect(nextIntakeYear(2027, [2028], now)).toBe(2029);
  });
  it("never plans for a year already started", () => {
    expect(nextIntakeYear(2024, [], now)).toBe(2027);
    expect(nextIntakeYear(null, [], now)).toBe(2027);
  });
});
