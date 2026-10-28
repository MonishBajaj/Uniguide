import { describe, expect, it } from "vitest";
import { applyTrack, inTrack, selectedTrack } from "./tracks";

const profile = { target_levels: ["master"], target_countries: ["GB", "US", "DE"], target_fields: ["0613"], budget_amount: 60000, budget_currency: "USD", grade_value: 8.4 };
const mba = { id: "t1", name: "MBA", target_levels: ["master"], target_countries: ["US"], target_fields: ["0413"], budget_amount: 120000, budget_currency: "USD" };

describe("applyTrack", () => {
  it("keeps the profile on Main", () => {
    expect(applyTrack(profile, null)).toBe(profile);
  });
  it("replaces targets and budget, keeping everything else", () => {
    expect(applyTrack(profile, mba)).toEqual({ ...profile, target_countries: ["US"], target_fields: ["0413"], budget_amount: 120000 });
  });
  it("falls back to the profile's budget when the track has none", () => {
    const out = applyTrack(profile, { ...mba, budget_amount: null, budget_currency: null });
    expect([out.budget_amount, out.budget_currency]).toEqual([60000, "USD"]);
  });
});

describe("selectedTrack", () => {
  it("accepts only the student's own track ids", () => {
    expect(selectedTrack("t1", [mba])).toBe(mba);
    expect(selectedTrack("main", [mba])).toBeNull();
    expect(selectedTrack("someone-else", [mba])).toBeNull();
    expect(selectedTrack(["t1"], [mba])).toBeNull();
  });
});

describe("inTrack", () => {
  it("filters the tracker", () => {
    expect(inTrack("t1", undefined)).toBe(true);
    expect(inTrack(null, "main")).toBe(true);
    expect(inTrack("t1", "main")).toBe(false);
    expect(inTrack("t1", "t1")).toBe(true);
    expect(inTrack(null, "t1")).toBe(false);
  });
});
