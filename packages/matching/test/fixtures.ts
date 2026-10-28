import type { CostFact, DeadlineFact, MatchContext, ProgramInput, RequirementFact, StudentProfile } from "../src";

let counter = 0;
const id = (prefix: string) => `${prefix}-${++counter}`;

export const NOW = new Date("2026-10-28T12:00:00Z");
export const ctx: MatchContext = {
  now: NOW,
  fx: { "GBP->USD": { rate: 1.3, asOf: "2026-10-01", source: "test" } },
};

export function requirement(overrides: Partial<RequirementFact> & Pick<RequirementFact, "kind">): RequirementFact {
  return { id: id("req"), status: "verified", applicantCategory: "all", ...overrides };
}

export function deadline(dueAt: string, overrides: Partial<DeadlineFact> = {}): DeadlineFact {
  return { id: id("dl"), status: "verified", applicantCategory: "all", kind: "application", precision: "date", dueAt, ...overrides };
}

export function cost(overrides: Partial<CostFact> & Pick<CostFact, "kind" | "basis" | "base">): CostFact {
  return {
    id: id("cost"),
    status: "verified",
    applicantCategory: "all",
    low: overrides.base,
    high: overrides.base,
    currency: "GBP",
    mandatory: true,
    ...overrides,
  };
}

/** A one-year UK master's with complete, verified facts. */
export function ukMasters(overrides: Partial<ProgramInput> = {}): ProgramInput {
  return {
    id: id("prog"),
    level: "master",
    country: "GB",
    iscedF: "0613",
    deliveryMode: "on_campus",
    durationMonths: 12,
    requirements: [
      requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", minGradeNumeric: 60, gradeScale: "percent", minGradeText: "60%" }),
      requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 6.5, minSections: { writing: 6 } }),
    ],
    deadlines: [deadline("2027-06-30T00:00:00+01:00")],
    costs: [
      cost({ kind: "tuition", basis: "per_year", base: 30000 }),
      cost({ kind: "living", basis: "per_month", low: 1100, base: 1300, high: 1600 }),
    ],
    ...overrides,
  };
}

export function student(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    residenceCountry: "IN",
    homeQualification: "bachelor_4yr",
    gradeValue: 72,
    gradeScale: "percent",
    budget: { amount: 70000, currency: "USD" },
    targetLevels: ["master"],
    targetCountries: ["GB", "DE"],
    targetFields: ["0613"],
    testScores: [{ exam: "ielts_academic", total: 7, sections: { writing: 6.5 }, takenOn: "2026-06-01" }],
    ...overrides,
  };
}
