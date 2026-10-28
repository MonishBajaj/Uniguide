import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALGORITHM_VERSION, budgetHeadroom, costScenarios, fitScore, matchPrograms } from "../src";
import type { ProgramInput, StudentProfile } from "../src";
import { cost, ctx, student, ukMasters } from "./fixtures";

describe("matchPrograms", () => {
  it("excludes a program at twice the budget (the old weighted formula still scored it 75%)", () => {
    const expensive = ukMasters({ costs: [cost({ kind: "tuition", basis: "per_year", base: 90000 }), cost({ kind: "living", basis: "per_month", base: 1300 })] });
    const { results } = matchPrograms([expensive], student(), ctx);
    expect(results[0]!.excluded).toBe(true);
    expect(results[0]!.exclusions.map((e) => e.rule)).toContain("budget");
  });

  it("does not exclude on unverified costs, but they cannot raise the score", () => {
    const unverified = ukMasters({
      costs: [cost({ kind: "tuition", basis: "per_year", base: 90000, status: "unverified" }), cost({ kind: "living", basis: "per_month", base: 1300 })],
    });
    const { results } = matchPrograms([unverified], student(), ctx);
    expect(results[0]!.exclusions.map((e) => e.rule)).not.toContain("budget");
    expect(results[0]!.fit.components.find((c) => c.criterion === "budget")!.value).toBe(0);
  });

  it("keeps a program whose field is unknown, ranked below a known match", () => {
    const known = ukMasters({ id: "known" });
    const unknown = ukMasters({ id: "unknown", iscedF: null });
    const { results } = matchPrograms([unknown, known], student(), ctx);
    expect(results.map((r) => [r.programId, r.excluded])).toEqual([["known", false], ["unknown", false]]);
    expect(results[1]!.fit.score!).toBeLessThan(results[0]!.fit.score!);
  });

  it("explains every exclusion", () => {
    const program = ukMasters({ level: "bachelor", country: "AU" });
    const { results } = matchPrograms([program], student(), ctx);
    expect(results[0]!.exclusions.map((e) => e.rule).sort()).toEqual(["country", "level"]);
  });

  it("ranks feasible programs above excluded ones, then by suitability", () => {
    const good = ukMasters({ id: "good" });
    const partial = ukMasters({ id: "partial", country: "DE" }); // second-choice country
    const out = ukMasters({ id: "out", level: "doctorate" });
    const { results, algorithmVersion } = matchPrograms([out, partial, good], student(), ctx);
    expect(results.map((r) => r.programId)).toEqual(["good", "partial", "out"]);
    expect(algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it("is deterministic", () => {
    const programs = [ukMasters({ id: "a" }), ukMasters({ id: "b", country: "DE" })];
    expect(matchPrograms(programs, student(), ctx)).toEqual(matchPrograms(programs, student(), ctx));
  });
});

describe("fitScore", () => {
  it("leaves out criteria the student has no preference for", () => {
    const fit = fitScore(ukMasters(), student({ budget: null, targetCountries: [] }), costScenarios(ukMasters(), ctx));
    expect(fit.components.map((c) => c.criterion)).toEqual(["field"]);
    expect(fit.score).toBe(100);
  });

  it("has no score when no criterion applies", () => {
    const fit = fitScore(ukMasters(), student({ budget: null, targetCountries: [], targetFields: [] }), costScenarios(ukMasters(), ctx));
    expect(fit.score).toBeNull();
  });

  it("reports how much of the weighted data was known", () => {
    const program = ukMasters({ iscedF: null });
    const fit = fitScore(program, student(), costScenarios(program, ctx, { budgetCurrency: "USD" }));
    expect(fit.dataCoverage).toBeCloseTo(1 - 0.4 / 0.9);
  });
});

// Property tests -----------------------------------------------------------------

const arbProfile: fc.Arbitrary<StudentProfile> = fc.record({
  budget: fc.option(fc.record({ amount: fc.integer({ min: 1000, max: 200000 }), currency: fc.constantFrom("USD", "GBP") }), { nil: null }),
  fields: fc.subarray(["06", "0613", "0410", "0731"]),
  countries: fc.subarray(["GB", "DE", "US"]),
  delivery: fc.option(fc.constantFrom("on_campus" as const, "online" as const), { nil: null }),
}).map(({ budget, fields, countries, delivery }) =>
  student({ budget, targetFields: fields, targetCountries: countries, preferredDelivery: delivery }),
);

const arbProgram: fc.Arbitrary<ProgramInput> = fc.record({
  iscedF: fc.option(fc.constantFrom("0613", "0610", "0410", "0731"), { nil: null }),
  country: fc.constantFrom("GB", "DE", "US"),
  durationMonths: fc.option(fc.integer({ min: 9, max: 48 }), { nil: null }),
  tuition: fc.option(fc.integer({ min: 0, max: 80000 }), { nil: null }),
  living: fc.option(fc.integer({ min: 0, max: 3000 }), { nil: null }),
  delivery: fc.constantFrom("on_campus" as const, "online" as const),
}).map(({ iscedF, country, durationMonths, tuition, living, delivery }) =>
  ukMasters({
    iscedF,
    country,
    durationMonths,
    deliveryMode: delivery,
    costs: [
      ...(tuition == null ? [] : [cost({ kind: "tuition", basis: "per_year", base: tuition })]),
      ...(living == null ? [] : [cost({ kind: "living", basis: "per_month", base: living })]),
    ],
  }),
);

function score(program: ProgramInput, profile: StudentProfile) {
  const c = costScenarios(program, ctx, { budgetCurrency: profile.budget?.currency });
  return fitScore(program, profile, c).score;
}

describe("properties", () => {
  it("scores stay within 0..100", () => {
    fc.assert(
      fc.property(arbProgram, arbProfile, (program, profile) => {
        const s = score(program, profile);
        return s === null || (s >= 0 && s <= 100);
      }),
    );
  });

  it("removing a known fact never raises the score", () => {
    fc.assert(
      fc.property(arbProgram, arbProfile, fc.constantFrom("iscedF", "durationMonths", "tuition", "living"), (program, profile, drop) => {
        const before = score(program, profile);
        const reduced: ProgramInput = { ...program, costs: [...program.costs] };
        if (drop === "iscedF") reduced.iscedF = null;
        if (drop === "durationMonths") reduced.durationMonths = null;
        if (drop === "tuition") reduced.costs = reduced.costs.filter((c) => c.kind !== "tuition");
        if (drop === "living") reduced.costs = reduced.costs.filter((c) => c.kind !== "living");
        const after = score(reduced, profile);
        return (after ?? -1) <= (before ?? -1);
      }),
    );
  });

  it("a larger budget never lowers the score", () => {
    fc.assert(
      fc.property(arbProgram, arbProfile, fc.integer({ min: 0, max: 100000 }), (program, profile, extra) => {
        fc.pre(profile.budget != null);
        const richer = { ...profile, budget: { ...profile.budget!, amount: profile.budget!.amount + extra } };
        return (score(program, richer) ?? -1) >= (score(program, profile) ?? -1);
      }),
    );
  });

  it("budget headroom is monotonic and bounded", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300000 }), fc.integer({ min: 0, max: 50000 }), fc.integer({ min: 1000, max: 200000 }), (cost, extra, budget) => {
        const a = budgetHeadroom(cost, budget, 1.25);
        const b = budgetHeadroom(cost + extra, budget, 1.25);
        return a >= 0 && a <= 1 && b <= a;
      }),
    );
  });
});
