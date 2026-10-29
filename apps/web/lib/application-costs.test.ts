import { describe, expect, it } from "vitest";
import { approximateTotal, totalsByCurrency } from "./application-costs";

describe("application costs", () => {
  const costs = [
    { amount: 80, currency: "GBP" },
    { amount: 250, currency: "USD" },
    { amount: 20, currency: "GBP" },
    { amount: 75, currency: "EUR" },
  ];

  it("totals each currency separately", () => {
    expect(totalsByCurrency(costs)).toEqual([
      { currency: "USD", amount: 250 },
      { currency: "GBP", amount: 100 },
      { currency: "EUR", amount: 75 },
    ]);
  });

  it("converts what it can and names currencies without a rate", () => {
    const fx = {
      "USD->INR": { rate: 84, asOf: "2026-10-01", source: "test" },
      "GBP->INR": { rate: 110, asOf: "2026-10-01", source: "test" },
    };
    expect(approximateTotal(totalsByCurrency(costs), "INR", fx)).toEqual({ amount: 250 * 84 + 100 * 110, currency: "INR", missing: ["EUR"] });
  });

  it("needs no rate for the target currency itself", () => {
    expect(approximateTotal([{ amount: 40, currency: "INR" }], "INR", {})).toEqual({ amount: 40, currency: "INR", missing: [] });
  });
});
