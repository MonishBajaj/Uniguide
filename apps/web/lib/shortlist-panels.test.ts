import { describe, expect, it, vi } from "vitest";
import type { CycleFacts } from "@/lib/catalog";

vi.mock("server-only", () => ({}));
const { shortlistPanels } = await import("./shortlist-panels");

// J3.1: the shortlist page's advice, comparison and cost rows, from the same facts matching uses.

const card = (id: string, country: string) =>
  ({ id, title: `Course ${id}`, country, institution_id: `inst-${id}`, level: "master", delivery_mode: "on_campus", duration_months: 12 }) as never;

const cost = (base: number, currency: string, status = "verified") =>
  ({ id: `c-${base}`, status, applicant_category: "all", kind: "tuition", basis: "total", low: base, base, high: base, currency, mandatory: true }) as never;

const cycle = (programId: string, costs: never[], deadlines: never[] = []): CycleFacts =>
  ({ id: `cy-${programId}`, program_id: programId, requirements: [], deadlines, cost_items: costs }) as never;

const input = (over: Partial<Parameters<typeof shortlistPanels>[0]> = {}) => ({
  cards: [card("a", "GB"), card("b", "GB")],
  cycles: new Map([
    ["a", cycle("a", [cost(30000, "GBP")])],
    ["b", cycle("b", [])],
  ]),
  student: { residenceCountry: "IN", targetCountries: ["GB", "DE"] },
  budget: { amount: 25000, currency: "GBP" },
  fx: {},
  admitRates: new Map(),
  funding: new Map(),
  now: new Date("2026-11-01T00:00:00Z"),
  ...over,
});

describe("shortlistPanels", () => {
  it("flags a course over the budget on its published base cost, in the budget's currency", () => {
    const { costs, advice } = shortlistPanels(input());
    expect(costs.map((c) => [c.programId, c.inBudgetCurrency])).toEqual([["a", 30000], ["b", null]]);
    expect(advice.find((a) => a.kind === "over_budget")?.programIds).toEqual(["a"]);
  });

  it("can't compare a cost in another currency without a rate", () => {
    const { costs, advice } = shortlistPanels(input({ budget: { amount: 1, currency: "INR" } }));
    expect(costs[0]!.inBudgetCurrency).toBeNull();
    expect(advice.some((a) => a.kind === "over_budget")).toBe(false);
  });

  it("counts published assistantships as funding, and notes one-country shortlists", () => {
    const { advice } = shortlistPanels(input({ funding: new Map([["a", 1]]) }));
    expect(advice.find((a) => a.kind === "no_funding")?.programIds).toEqual(["b"]);
    expect(advice.some((a) => a.kind === "single_country")).toBe(true);
  });

  it("passes on only a verified admit rate, and never a band", () => {
    const { comparison, advice } = shortlistPanels(
      input({ admitRates: new Map([["a", { rate: 0.2, status: "verified" }], ["b", { rate: 0.1, status: "unverified" }]]) }),
    );
    expect(comparison.map((c) => c.admitRate)).toEqual([0.2, null]);
    expect(advice.some((a) => a.kind === "band_balance")).toBe(false);
  });
});
