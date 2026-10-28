/**
 * Eligibility eval: 30 synthetic students across countries and levels, including school-leaving
 * qualifications, TOEFL old and new scales, conditional waivers, and conflicting or unverified
 * sources. Each case states the expected overall result and the reason it must give.
 */
import { describe, expect, it } from "vitest";
import { checkEligibility, type EligibilityResult, type ProgramInput, type RequirementFact, type StudentProfile } from "../src";
import { ctx, deadline, requirement } from "./fixtures";

const program = (country: string, level: ProgramInput["level"], requirements: RequirementFact[]): ProgramInput => ({
  id: `${country}-${level}`,
  level,
  country,
  iscedF: "06",
  deliveryMode: "on_campus",
  durationMonths: 12,
  requirements,
  deadlines: [deadline("2027-03-01T00:00:00Z")],
  costs: [],
});
const q = (qualification: string, extra: Partial<RequirementFact> = {}) => requirement({ kind: "entry_qualification", qualification, ...extra });
const lang = (exam: string, minTotal: number, extra: Partial<RequirementFact> = {}) => requirement({ kind: "language_test", exam, minTotal, ...extra });
const me = (residence: string, extra: Partial<StudentProfile>): StudentProfile => ({ residenceCountry: residence, ...extra });
const score = (exam: string, total: number, extra: object = {}) => ({ exam, total, takenOn: "2026-05-01", ...extra });

type Case = { name: string; program: ProgramInput; student: StudentProfile; expect: EligibilityResult; reason?: RegExp };

const CASES: Case[] = [
  // UK undergraduate, school-leaving qualifications
  { name: "A-levels AAA meets AAA (text-only minimum)", program: program("GB", "bachelor", [q("a_levels", { minGradeText: "AAA" }), lang("ielts_academic", 6.5)]), student: me("IN", { homeQualification: "a_levels", testScores: [score("ielts_academic", 7)] }), expect: "meets" },
  { name: "IB 38 vs minimum 36 on the ib_45 scale", program: program("GB", "bachelor", [q("ib", { minGradeNumeric: 36, gradeScale: "ib_45" }), lang("ielts_academic", 6.5)]), student: me("AE", { homeQualification: "ib", gradeValue: 38, gradeScale: "ib_45", testScores: [score("ielts_academic", 7)] }), expect: "meets" },
  { name: "IB 33 below 36", program: program("GB", "bachelor", [q("ib", { minGradeNumeric: 36, gradeScale: "ib_45" })]), student: me("AE", { homeQualification: "ib", gradeValue: 33, gradeScale: "ib_45" }), expect: "does_not_meet", reason: /below the minimum/ },
  { name: "CBSE 92% vs 85% (percent)", program: program("GB", "bachelor", [q("cbse", { minGradeNumeric: 85, gradeScale: "percent" }), lang("ielts_academic", 6)]), student: me("IN", { homeQualification: "cbse", gradeValue: 92, gradeScale: "percent", testScores: [score("ielts_academic", 6.5)] }), expect: "meets" },
  { name: "CBSE without a listed requirement for CBSE", program: program("GB", "bachelor", [q("a_levels", { minGradeText: "AAB" })]), student: me("IN", { homeQualification: "cbse", gradeValue: 92, gradeScale: "percent" }), expect: "needs_clarification", reason: /not listed/ },
  { name: "Home UK student exempt from international English test", program: program("GB", "bachelor", [q("a_levels"), lang("ielts_academic", 9, { applicantCategory: "international" })]), student: me("GB", { homeQualification: "a_levels" }), expect: "needs_clarification", reason: /Language requirements are not yet known/ },

  // Australia
  { name: "ATAR 90 vs 85", program: program("AU", "bachelor", [q("atar", { minGradeNumeric: 85, gradeScale: "atar" }), lang("pte_academic", 58)]), student: me("AU", { homeQualification: "atar", gradeValue: 90, gradeScale: "atar", testScores: [score("pte_academic", 65)] }), expect: "meets" },
  { name: "PTE 50 below 58", program: program("AU", "master", [q("bachelor_any"), lang("pte_academic", 58)]), student: me("NP", { homeQualification: "bachelor_any", testScores: [score("pte_academic", 50)] }), expect: "does_not_meet" },
  { name: "PTE section below its minimum", program: program("AU", "master", [q("bachelor_any"), lang("pte_academic", 58, { minSections: { writing: 50 } })]), student: me("NP", { homeQualification: "bachelor_any", testScores: [score("pte_academic", 65, { sections: { writing: 45 } })] }), expect: "does_not_meet", reason: /writing 45/ },

  // United States graduate
  { name: "GPA 3.4/4 vs 3.0/4", program: program("US", "master", [q("bachelor_4yr", { minGradeNumeric: 3, gradeScale: "gpa_4" }), lang("toefl_ibt", 100, { examVersion: "legacy" })]), student: me("IN", { homeQualification: "bachelor_4yr", gradeValue: 3.4, gradeScale: "gpa_4", testScores: [score("toefl_ibt", 104, { examVersion: "legacy", takenOn: "2025-11-01" })] }), expect: "meets" },
  { name: "CGPA out of 10 vs a 4.0 minimum is never converted", program: program("US", "master", [q("bachelor_4yr", { minGradeNumeric: 3, gradeScale: "gpa_4" })]), student: me("IN", { homeQualification: "bachelor_4yr", gradeValue: 8.2, gradeScale: "gpa_10" }), expect: "needs_clarification", reason: /different grading scale/ },
  { name: "TOEFL new 1-6 band meets 4.5", program: program("US", "master", [q("bachelor_4yr"), lang("toefl_ibt", 4.5, { examVersion: "2026-01" })]), student: me("CN", { homeQualification: "bachelor_4yr", testScores: [score("toefl_ibt", 5, { examVersion: "2026-01" })] }), expect: "meets" },
  { name: "TOEFL legacy 105 vs new-scale minimum is not compared", program: program("US", "master", [q("bachelor_4yr"), lang("toefl_ibt", 4.5, { examVersion: "2026-01" })]), student: me("CN", { homeQualification: "bachelor_4yr", testScores: [score("toefl_ibt", 105, { examVersion: "legacy", takenOn: "2025-12-01" })] }), expect: "needs_clarification", reason: /scales differ/ },
  { name: "TOEFL score with unknown version", program: program("US", "master", [q("bachelor_4yr"), lang("toefl_ibt", 100, { examVersion: "legacy" })]), student: me("CN", { homeQualification: "bachelor_4yr", testScores: [score("toefl_ibt", 105)] }), expect: "needs_clarification" },
  { name: "GRE required, no score", program: program("US", "doctorate", [q("bachelor_4yr"), lang("toefl_ibt", 100, { examVersion: "legacy" }), requirement({ kind: "admissions_test", exam: "gre", testPolicy: "required" })]), student: me("IN", { homeQualification: "bachelor_4yr", testScores: [score("toefl_ibt", 110, { examVersion: "legacy" })] }), expect: "needs_clarification", reason: /GRE is required/ },
  { name: "GRE optional is no barrier", program: program("US", "master", [q("bachelor_4yr"), lang("ielts_academic", 7), requirement({ kind: "admissions_test", exam: "gre", testPolicy: "optional" })]), student: me("IN", { homeQualification: "bachelor_4yr", testScores: [score("ielts_academic", 7.5)] }), expect: "meets" },
  { name: "GRE waived conditionally is shown as a condition, not a pass", program: program("US", "master", [q("bachelor_4yr"), lang("ielts_academic", 7), requirement({ kind: "admissions_test", exam: "gre", testPolicy: "waived_conditional" })]), student: me("IN", { homeQualification: "bachelor_4yr", testScores: [score("ielts_academic", 7.5)] }), expect: "needs_clarification", reason: /only under conditions/ },
  { name: "GRE policy conflicting across official pages", program: program("US", "master", [q("bachelor_4yr"), lang("ielts_academic", 7), requirement({ kind: "admissions_test", exam: "gre", testPolicy: "conflicting", status: "conflicting" })]), student: me("IN", { homeQualification: "bachelor_4yr", testScores: [score("ielts_academic", 7.5)] }), expect: "needs_clarification", reason: /contradictory/ },

  // Germany
  { name: "TestDaF 16 meets 16", program: program("DE", "master", [q("bachelor_any"), lang("testdaf", 16)]), student: me("IN", { homeQualification: "bachelor_any", testScores: [score("testdaf", 16)] }), expect: "meets" },
  { name: "English-taught German master accepts IELTS", program: program("DE", "master", [q("bachelor_any"), lang("ielts_academic", 6.5), lang("testdaf", 16)]), student: me("IN", { homeQualification: "bachelor_any", testScores: [score("ielts_academic", 7)] }), expect: "meets" },
  { name: "German grade scale vs student percent", program: program("DE", "master", [q("bachelor_any", { minGradeNumeric: 2.5, gradeScale: "german_1_5" })]), student: me("IN", { homeQualification: "bachelor_any", gradeValue: 72, gradeScale: "percent" }), expect: "needs_clarification" },
  { name: "EU student, EU-only requirement applies", program: program("DE", "master", [q("bachelor_any"), lang("goethe", 4, { applicantCategory: "eu_eea" })]), student: me("FR", { homeQualification: "bachelor_any", testScores: [score("goethe", 4)] }), expect: "meets" },

  // Canada and Ireland
  { name: "Canadian bachelor, IELTS 6.5 with writing 6 met", program: program("CA", "bachelor", [q("cbse", { minGradeNumeric: 85, gradeScale: "percent" }), lang("ielts_academic", 6.5, { minSections: { writing: 6 } })]), student: me("IN", { homeQualification: "cbse", gradeValue: 88, gradeScale: "percent", testScores: [score("ielts_academic", 7, { sections: { writing: 6.5 } })] }), expect: "meets" },
  { name: "IELTS without the writing section given", program: program("CA", "bachelor", [q("cbse"), lang("ielts_academic", 6.5, { minSections: { writing: 6 } })]), student: me("IN", { homeQualification: "cbse", testScores: [score("ielts_academic", 7)] }), expect: "needs_clarification", reason: /writing score/ },
  { name: "Irish Leaving Cert, Duolingo 120 vs 115", program: program("IE", "bachelor", [q("leaving_cert"), lang("duolingo", 115)]), student: me("IE", { homeQualification: "leaving_cert", testScores: [score("duolingo", 120)] }), expect: "meets" },

  // Desirable minimums, unverified and stale data
  { name: "Below a desirable minimum is a flag, not an exclusion", program: program("GB", "master", [q("bachelor_any", { minGradeNumeric: 65, gradeScale: "percent", isDesirable: true }), lang("ielts_academic", 6.5)]), student: me("IN", { homeQualification: "bachelor_any", gradeValue: 60, gradeScale: "percent", testScores: [score("ielts_academic", 7)] }), expect: "needs_clarification", reason: /desirable/ },
  { name: "Unverified requirements never produce meets", program: program("GB", "master", [q("bachelor_any", { status: "unverified" }), lang("ielts_academic", 6.5, { status: "unverified" })]), student: me("IN", { homeQualification: "bachelor_any", testScores: [score("ielts_academic", 8)] }), expect: "needs_clarification", reason: /unverified/ },
  { name: "Unverified high minimum never produces does-not-meet", program: program("GB", "master", [q("bachelor_any"), lang("ielts_academic", 8.5, { status: "unverified" })]), student: me("IN", { homeQualification: "bachelor_any", testScores: [score("ielts_academic", 7)] }), expect: "needs_clarification" },
  { name: "Expired IELTS by the deadline", program: program("GB", "master", [q("bachelor_any"), lang("ielts_academic", 6.5)]), student: me("IN", { homeQualification: "bachelor_any", testScores: [score("ielts_academic", 8, { takenOn: "2024-12-01" })] }), expect: "needs_clarification", reason: /expired/ },
  { name: "Foundation course with no published requirements", program: program("GB", "foundation", []), student: me("NG", { homeQualification: "a_levels" }), expect: "needs_clarification", reason: /not yet known/ },
];

describe("eligibility eval", () => {
  it("has 30 cases", () => expect(CASES).toHaveLength(30));

  for (const c of CASES) {
    it(c.name, () => {
      const result = checkEligibility(c.program, c.student, ctx);
      const decisive = result.checks.filter((x) => x.kind !== "deadline");
      const overall = decisive.reduce<EligibilityResult>((w, x) => (x.result === "does_not_meet" || (x.result === "needs_clarification" && w === "meets") ? x.result : w), "meets");
      expect(overall).toBe(c.expect);
      if (c.reason) expect(decisive.map((x) => x.reason).join(" ")).toMatch(c.reason);
    });
  }
});
