import { describe, expect, it } from "vitest";
import { shortlistAdvice, type ShortlistItem } from "../src";

let n = 0;
const item = (over: Partial<ShortlistItem> = {}): ShortlistItem => ({
  programId: `p${n++}`,
  title: `Course ${n}`,
  band: null,
  deadlines: [],
  country: "GB",
  fundingFacts: 1,
  baseCost: 30000,
  ...over,
});
const profile = { budget: 50000, countries: ["GB", "DE"] };
const kinds = (items: ShortlistItem[], p = profile) => shortlistAdvice(items, p).map((a) => a.kind);

describe("shortlistAdvice", () => {
  it("empty shortlist gives a single start-here item", () => {
    expect(shortlistAdvice([], profile)).toEqual([{ kind: "empty", message: expect.stringContaining("Shortlist"), programIds: [] }]);
  });

  it("flags three or more deadlines within a week", () => {
    const items = [
      item({ deadlines: ["2027-01-15T00:00:00Z"] }),
      item({ deadlines: ["2027-01-17T00:00:00Z"] }),
      item({ deadlines: ["2027-01-20T00:00:00Z"] }),
      item({ deadlines: ["2027-03-01T00:00:00Z"] }),
    ];
    const advice = shortlistAdvice(items, profile).find((a) => a.kind === "deadline_cluster");
    expect(advice?.programIds).toHaveLength(3);
  });

  it("does not flag two deadlines in a week", () => {
    const items = [item({ deadlines: ["2027-01-15T00:00:00Z"] }), item({ deadlines: ["2027-01-17T00:00:00Z"] })];
    expect(kinds(items)).not.toContain("deadline_cluster");
  });

  it("flags courses over budget and courses with no funding facts", () => {
    const items = [item({ baseCost: 90000 }), item({ fundingFacts: 0 })];
    const advice = shortlistAdvice(items, profile);
    expect(advice.find((a) => a.kind === "over_budget")?.programIds).toEqual([items[0]!.programId]);
    expect(advice.find((a) => a.kind === "no_funding")?.programIds).toEqual([items[1]!.programId]);
  });

  it("notes a shortlist in a single country", () => {
    expect(kinds([item(), item()])).toContain("single_country");
    expect(kinds([item(), item({ country: "DE" })])).not.toContain("single_country");
  });

  it("notes a lopsided spread of bands only when bands are on", () => {
    const risky = [item({ band: "reach" }), item({ band: "reach" }), item({ band: "reach" })];
    expect(kinds(risky)).toContain("band_balance");
    expect(kinds([item(), item(), item()])).not.toContain("band_balance");
  });
});
