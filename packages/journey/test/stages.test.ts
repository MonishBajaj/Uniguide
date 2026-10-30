import { describe, expect, it } from "vitest";
import { activeApplications, computeStage, hasOpenDeadline, matchingMinimumMet, STAGES, variantsFor } from "../src";
import { application, programs, readyProfile, STAGE_FIXTURES, TODAY } from "./fixtures";

describe("computeStage", () => {
  it.each(Object.entries(STAGE_FIXTURES))("%s", (_name, { input, stage }) => {
    expect(computeStage(input)).toBe(stage);
  });
});

describe("matching minimum (plan D4)", () => {
  it("does not need a test score", () => {
    expect(matchingMinimumMet(readyProfile)).toBe(true);
  });
  it("needs research interests for a doctorate", () => {
    expect(matchingMinimumMet({ ...readyProfile, targetLevels: ["doctorate"] })).toBe(false);
    expect(matchingMinimumMet({ ...readyProfile, targetLevels: ["doctorate"], researchInterests: "Scheduling under uncertainty" })).toBe(true);
  });
  it("needs the currency with the budget and the scale with the grade", () => {
    expect(matchingMinimumMet({ ...readyProfile, budgetCurrency: null })).toBe(false);
    expect(matchingMinimumMet({ ...readyProfile, gradeScale: null })).toBe(false);
  });
});

describe("helpers", () => {
  it("ignores withdrawn applications and withdrawn or deferred decisions", () => {
    const apps = [
      application("a", programs.exampleton!, { status: "withdrawn" }),
      application("b", programs.tum!, { status: "decided", decision: "deferred" }),
      application("c", programs.state!, { status: "preparing" }),
    ];
    expect(activeApplications(apps).map((a) => a.id)).toEqual(["c"]);
  });
  it("treats a deadline today as open, yesterday as closed, and none as open", () => {
    const due = (d: string) => application("a", programs.exampleton!, { deadlines: [{ id: "d", dueAt: `${d}T23:59:00Z`, timezone: "UTC", precision: "date", status: "verified" }] });
    expect(hasOpenDeadline(due(TODAY), TODAY)).toBe(true);
    expect(hasOpenDeadline(due("2026-11-01"), TODAY)).toBe(false);
    expect(hasOpenDeadline(application("a", programs.exampleton!, { deadlines: [] }), TODAY)).toBe(true);
  });
  it("maps levels to variants without duplicates", () => {
    expect(variantsFor(["bachelor", "foundation"])).toEqual(["undergraduate"]);
    expect(variantsFor(["master", "doctorate"])).toEqual(["masters", "research"]);
  });
  it("describes every stage with a parent note", () => {
    for (const s of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(STAGES[s].name.length).toBeGreaterThan(0);
      expect(STAGES[s].parentNote.length).toBeGreaterThan(0);
    }
  });
});
