import { describe, expect, it } from "vitest";
import { checkEligibility } from "../src";
import { ctx, deadline, requirement, student, ukMasters } from "./fixtures";

const byKind = (result: ReturnType<typeof checkEligibility>, kind: string) => result.checks.find((c) => c.kind === kind)!;

describe("checkEligibility", () => {
  it("meets every verified requirement for a strong profile", () => {
    const result = checkEligibility(ukMasters(), student(), ctx);
    expect(result.overall).toBe("meets");
  });

  it("does not meet a verified grade minimum on the same scale", () => {
    const result = checkEligibility(ukMasters(), student({ gradeValue: 55 }), ctx);
    expect(byKind(result, "entry_qualification").result).toBe("does_not_meet");
    expect(result.overall).toBe("does_not_meet");
  });

  it("never silently converts between grading scales", () => {
    const result = checkEligibility(ukMasters(), student({ gradeValue: 3.8, gradeScale: "gpa_4" }), ctx);
    expect(byKind(result, "entry_qualification").result).toBe("needs_clarification");
  });

  it("treats a desirable minimum as a flag, not an exclusion", () => {
    const program = ukMasters({
      requirements: [
        requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", minGradeNumeric: 65, gradeScale: "percent", isDesirable: true }),
        requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 6.5 }),
      ],
    });
    const result = checkEligibility(program, student({ gradeValue: 62 }), ctx);
    expect(byKind(result, "entry_qualification").result).toBe("needs_clarification");
  });

  it("never concludes 'meets' from unverified facts", () => {
    const program = ukMasters({
      requirements: [
        requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", status: "unverified" }),
        requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 6.5, status: "unverified" }),
      ],
    });
    const result = checkEligibility(program, student(), ctx);
    expect(byKind(result, "entry_qualification").result).toBe("needs_clarification");
    expect(byKind(result, "language_test").result).toBe("needs_clarification");
  });

  it("never concludes 'does not meet' from unverified facts either", () => {
    const program = ukMasters({
      requirements: [requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 8, status: "unverified" })],
    });
    const result = checkEligibility(program, student(), ctx);
    expect(byKind(result, "language_test").result).toBe("needs_clarification");
  });

  it("flags conflicting official sources", () => {
    const program = ukMasters({
      requirements: [requirement({ kind: "admissions_test", exam: "gre", testPolicy: "conflicting", status: "conflicting" })],
    });
    const result = checkEligibility(program, student(), ctx);
    expect(byKind(result, "admissions_test").result).toBe("needs_clarification");
  });

  it("says requirements are unknown rather than assuming none", () => {
    const result = checkEligibility(ukMasters({ requirements: [] }), student(), ctx);
    expect(byKind(result, "entry_qualification").result).toBe("needs_clarification");
    expect(byKind(result, "language_test").result).toBe("needs_clarification");
  });

  describe("language tests", () => {
    it("checks section minimums", () => {
      const result = checkEligibility(ukMasters(), student({ testScores: [{ exam: "ielts_academic", total: 7, sections: { writing: 5.5 }, takenOn: "2026-06-01" }] }), ctx);
      expect(byKind(result, "language_test").result).toBe("does_not_meet");
      expect(byKind(result, "language_test").reason).toMatch(/writing 5.5/);
    });

    it("asks for a missing section score instead of assuming it", () => {
      const result = checkEligibility(ukMasters(), student({ testScores: [{ exam: "ielts_academic", total: 7, takenOn: "2026-06-01" }] }), ctx);
      expect(byKind(result, "language_test").result).toBe("needs_clarification");
    });

    it("does not compare TOEFL scores across versions (new 1-6 scale vs legacy 0-120)", () => {
      const program = ukMasters({
        requirements: [requirement({ kind: "language_test", exam: "toefl_ibt", examVersion: "2026-01", minTotal: 4.5 })],
      });
      const legacy = student({ testScores: [{ exam: "toefl_ibt", examVersion: "legacy", total: 100, takenOn: "2025-11-01" }] });
      expect(byKind(checkEligibility(program, legacy, ctx), "language_test").result).toBe("needs_clarification");
      const current = student({ testScores: [{ exam: "toefl_ibt", examVersion: "2026-01", total: 5, takenOn: "2026-03-01" }] });
      expect(byKind(checkEligibility(program, current, ctx), "language_test").result).toBe("meets");
    });

    it("accepts any one of several accepted tests", () => {
      const program = ukMasters({
        requirements: [
          requirement({ kind: "entry_qualification", qualification: "bachelor_4yr" }),
          requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 7.5 }),
          requirement({ kind: "language_test", exam: "pte_academic", minTotal: 65 }),
        ],
      });
      const profile = student({
        testScores: [
          { exam: "ielts_academic", total: 7, takenOn: "2026-06-01" },
          { exam: "pte_academic", total: 70, takenOn: "2026-06-01" },
        ],
      });
      expect(byKind(checkEligibility(program, profile, ctx), "language_test").result).toBe("meets");
    });

    it("flags a score that will have expired by the deadline", () => {
      const result = checkEligibility(ukMasters(), student({ testScores: [{ exam: "ielts_academic", total: 8, sections: { writing: 7 }, takenOn: "2025-01-10" }] }), ctx);
      expect(byKind(result, "language_test").result).toBe("needs_clarification");
      expect(byKind(result, "language_test").reason).toMatch(/expired/);
    });
  });

  describe("admissions tests", () => {
    it("treats an optional GRE as no barrier", () => {
      const program = ukMasters({ requirements: [...ukMasters().requirements, requirement({ kind: "admissions_test", exam: "gre", testPolicy: "optional" })] });
      expect(byKind(checkEligibility(program, student(), ctx), "admissions_test").result).toBe("meets");
    });

    it("asks for a required GRE score", () => {
      const program = ukMasters({ requirements: [...ukMasters().requirements, requirement({ kind: "admissions_test", exam: "gre", testPolicy: "required" })] });
      expect(byKind(checkEligibility(program, student(), ctx), "admissions_test").result).toBe("needs_clarification");
    });
  });

  describe("applicant categories", () => {
    it("applies international requirements to an international student only", () => {
      const program = ukMasters({
        requirements: [
          requirement({ kind: "entry_qualification", qualification: "bachelor_4yr" }),
          requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 9, applicantCategory: "international" }),
          requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 6, applicantCategory: "uk_home" }),
        ],
      });
      expect(byKind(checkEligibility(program, student(), ctx), "language_test").result).toBe("does_not_meet");
      expect(byKind(checkEligibility(program, student({ residenceCountry: "GB" }), ctx), "language_test").result).toBe("meets");
    });
  });

  describe("deadlines", () => {
    it("does not meet when every verified deadline has passed", () => {
      const program = ukMasters({ deadlines: [deadline("2026-09-01T00:00:00Z")] });
      expect(byKind(checkEligibility(program, student(), ctx), "deadline").result).toBe("does_not_meet");
    });

    it("only flags a passed deadline that is unverified", () => {
      const program = ukMasters({ deadlines: [deadline("2026-09-01T00:00:00Z", { status: "unverified" })] });
      expect(byKind(checkEligibility(program, student(), ctx), "deadline").result).toBe("needs_clarification");
    });

    it("keeps a date-only deadline open until the end of that day", () => {
      const program = ukMasters({ deadlines: [deadline("2026-10-28T00:00:00Z")] });
      expect(byKind(checkEligibility(program, student(), ctx), "deadline").result).toBe("meets");
    });

    it("needs clarification when no deadline is published", () => {
      expect(byKind(checkEligibility(ukMasters({ deadlines: [] }), student(), ctx), "deadline").result).toBe("needs_clarification");
    });
  });
});
