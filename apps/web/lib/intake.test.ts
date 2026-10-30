import { describe, expect, it } from "vitest";
import { intakeYears } from "./intake";

describe("intakeYears", () => {
  it("offers this year to five years ahead", () => {
    expect(intakeYears(2026)).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
  });

  it("keeps a year saved earlier that is now out of range", () => {
    expect(intakeYears(2026, 2025)).toEqual([2025, 2026, 2027, 2028, 2029, 2030, 2031]);
    expect(intakeYears(2026, 2028)).toHaveLength(6);
  });
});
