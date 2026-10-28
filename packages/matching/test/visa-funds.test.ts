import { describe, expect, it } from "vitest";
import { firstYearTuition, requiredFunds, type CountryRule } from "../src";
import { cost, ukMasters } from "./fixtures";

// Fixture numbers only: these are not real visa figures.
const funds = (over: Partial<CountryRule> = {}): CountryRule => ({
  id: "f1",
  kind: "proof_of_funds",
  title: "Funds",
  destination: "GB",
  appliesTo: [],
  status: "verified",
  amount: 1000,
  currency: "GBP",
  period: "per_month",
  months: 9,
  region: null,
  ...over,
});
const tuition = { amount: 20000, currency: "GBP" };

describe("requiredFunds", () => {
  it("adds monthly living costs over the stated months to the first year tuition", () => {
    const r = requiredFunds([funds()], "GB", null, tuition);
    expect(r).toMatchObject({ ok: true, living: 9000, tuition: 20000, total: 29000, currency: "GBP" });
  });

  it("uses a per-year or total amount as stated", () => {
    expect(requiredFunds([funds({ period: "per_year", amount: 12000, months: null })], "GB", null, tuition)).toMatchObject({ living: 12000 });
    expect(requiredFunds([funds({ period: "total", amount: 15000, months: null })], "GB", null, tuition)).toMatchObject({ living: 15000 });
  });

  it("picks the rule for the region, never sums two", () => {
    const rules = [funds({ id: "london", region: "london", amount: 1300 }), funds({ id: "rest", region: null, amount: 1000 })];
    expect(requiredFunds(rules, "GB", "london", tuition)).toMatchObject({ ok: true, living: 11700, rule: { id: "london" } });
    expect(requiredFunds(rules, "GB", null, tuition)).toMatchObject({ ok: true, living: 9000, rule: { id: "rest" } });
    expect(requiredFunds(rules, "GB", "elsewhere", tuition)).toMatchObject({ ok: true, rule: { id: "rest" } });
  });

  it("needs a region when only regional rules exist", () => {
    expect(requiredFunds([funds({ region: "london" })], "GB", null, tuition)).toEqual({ ok: false, reason: "region_required" });
  });

  it("ignores unverified rules", () => {
    expect(requiredFunds([funds({ status: "unverified" })], "GB", null, tuition)).toEqual({ ok: false, reason: "no_verified_rule" });
  });

  it("needs the months for a monthly amount", () => {
    expect(requiredFunds([funds({ months: null })], "GB", null, tuition)).toEqual({ ok: false, reason: "no_verified_rule" });
  });

  it("refuses a tuition in another currency", () => {
    expect(requiredFunds([funds()], "GB", null, { amount: 20000, currency: "USD" })).toEqual({ ok: false, reason: "currency_mismatch" });
  });

  it("needs a tuition fact", () => {
    expect(requiredFunds([funds()], "GB", null, null)).toEqual({ ok: false, reason: "no_tuition" });
  });
});

describe("firstYearTuition", () => {
  it("uses the course's own cost basis", () => {
    const perYear = ukMasters({ costs: [cost({ kind: "tuition", basis: "per_year", base: 30000, currency: "GBP" })] });
    expect(firstYearTuition(perYear)).toMatchObject({ amount: 30000, currency: "GBP" });
    const perCredit = ukMasters({
      requiredCredits: 36,
      durationMonths: 18,
      costs: [cost({ kind: "tuition", basis: "per_credit", base: 1000, currency: "GBP" })],
    });
    expect(firstYearTuition(perCredit)).toMatchObject({ amount: 24000 }); // 36 credits over 1.5 years = 24 a year
    const perTerm = ukMasters({ costs: [cost({ kind: "tuition", basis: "per_term", base: 10000, currency: "GBP" })] });
    expect(firstYearTuition(perTerm)).toMatchObject({ amount: 20000 });
  });

  it("is null without a tuition fact or without what a per-credit fee needs", () => {
    expect(firstYearTuition(ukMasters({ costs: [] }))).toBeNull();
    const noCredits = ukMasters({ requiredCredits: null, costs: [cost({ kind: "tuition", basis: "per_credit", base: 1000, currency: "GBP" })] });
    expect(firstYearTuition(noCredits)).toBeNull();
  });
});
