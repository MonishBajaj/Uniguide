import { describe, expect, it } from "vitest";
import { scoreGoals, type ScoreGoalRequirement } from "../src";

const req = (over: Partial<ScoreGoalRequirement> = {}): ScoreGoalRequirement => ({
  programId: "p1",
  title: "MSc A",
  exam: "ielts_academic",
  examVersion: null,
  minTotal: 6.5,
  minSections: { writing: 6 },
  ...over,
});
const score = (over = {}) => ({ exam: "ielts_academic", total: 7, sections: { writing: 6.5 }, takenOn: "2026-06-01", ...over });

describe("scoreGoals", () => {
  it("says the goal is met when total and every section reach the minimum", () => {
    expect(scoreGoals([score()], [req()])).toEqual([{ programId: "p1", exam: "ielts_academic", gapTotal: 0, gapSections: {}, met: true }]);
  });

  it("reports the gap in the total", () => {
    const [g] = scoreGoals([score({ total: 6 })], [req()]);
    expect(g).toMatchObject({ met: false, gapTotal: 0.5 });
  });

  it("reports the gap in one section", () => {
    const [g] = scoreGoals([score({ sections: { writing: 5.5 } })], [req()]);
    expect(g).toMatchObject({ met: false, gapSections: { writing: 0.5 }, gapTotal: 0 });
  });

  it("uses the best score for the exam and ignores other exams and versions", () => {
    const [g] = scoreGoals([score({ total: 5.5 }), score({ total: 7 }), score({ exam: "toefl_ibt", total: 100 })], [req()]);
    expect(g).toMatchObject({ met: true });
    expect(scoreGoals([score({ examVersion: "legacy" })], [req({ examVersion: "2026-01" })])).toEqual([]);
  });

  it("returns nothing when the student has no score for that exam", () => {
    expect(scoreGoals([], [req()])).toEqual([]);
  });
});
