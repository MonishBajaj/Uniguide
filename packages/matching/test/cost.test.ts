import { describe, expect, it } from "vitest";
import { costScenarios } from "../src";
import { cost, ctx, ukMasters } from "./fixtures";

describe("costScenarios", () => {
  it("multiplies per-year tuition and monthly living costs by the real duration", () => {
    const result = costScenarios(ukMasters(), ctx);
    expect(result.currency).toBe("GBP");
    expect(result.complete).toBe(true);
    expect(result.low).toBe(30000 + 1100 * 12);
    expect(result.base).toBe(30000 + 1300 * 12);
    expect(result.high).toBe(30000 + 1600 * 12);
  });

  it("charges per-credit tuition on the required credits", () => {
    const program = ukMasters({
      country: "US",
      requiredCredits: 30,
      durationMonths: 18,
      costs: [cost({ kind: "tuition", basis: "per_credit", base: 1500, currency: "USD" })],
    });
    const result = costScenarios(program, ctx);
    expect(result.base).toBe(45000);
    expect(result.complete).toBe(false); // no living costs published
    expect(result.missing).toContain("living costs");
  });

  it("is incomplete, never zero, when credits are unknown", () => {
    const program = ukMasters({
      requiredCredits: null,
      costs: [cost({ kind: "tuition", basis: "per_credit", base: 1500 }), cost({ kind: "living", basis: "per_month", base: 1000 })],
    });
    const result = costScenarios(program, ctx);
    expect(result.complete).toBe(false);
    expect(result.missing.some((m) => m.includes("required credits"))).toBe(true);
  });

  it("assumes two terms a year for per-term fees and says so", () => {
    const program = ukMasters({
      durationMonths: 24,
      costs: [cost({ kind: "tuition", basis: "per_term", base: 5000 }), cost({ kind: "living", basis: "per_year", base: 12000 })],
    });
    const result = costScenarios(program, ctx);
    expect(result.base).toBe(4 * 5000 + 2 * 12000);
    expect(result.assumptions.join(" ")).toMatch(/2 terms a year/);
  });

  it("converts to the budget currency and marks it approximate", () => {
    const result = costScenarios(ukMasters(), ctx, { budgetCurrency: "USD" });
    expect(result.converted?.currency).toBe("USD");
    expect(result.converted?.amount).toBeCloseTo((30000 + 1300 * 12) * 1.3);
    expect(result.converted?.approximate).toBe(true);
  });

  it("uses an inverse rate when only the other direction is known", () => {
    const result = costScenarios(ukMasters(), { fx: { "USD->GBP": { rate: 0.8, asOf: "2026-10-01", source: "t" } } }, { budgetCurrency: "USD" });
    expect(result.converted?.amount).toBeCloseTo((30000 + 1300 * 12) / 0.8);
  });

  it("subtracts only aid that has been awarded", () => {
    const without = costScenarios(ukMasters(), ctx);
    const withAid = costScenarios(ukMasters(), ctx, { awardedAid: [{ amount: 5000, currency: "GBP" }] });
    expect(withAid.base).toBe(without.base - 5000);
    expect(withAid.aidApplied).toBe(5000);
  });

  it("ignores optional costs", () => {
    const program = ukMasters();
    program.costs.push(cost({ kind: "insurance", basis: "one_off", base: 999, mandatory: false }));
    expect(costScenarios(program, ctx).base).toBe(30000 + 1300 * 12);
  });

  it("is incomplete when a currency cannot be converted", () => {
    const program = ukMasters();
    program.costs.push(cost({ kind: "fees", basis: "one_off", base: 100, currency: "EUR" }));
    const result = costScenarios(program, ctx);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("EUR→GBP exchange rate");
  });
});
