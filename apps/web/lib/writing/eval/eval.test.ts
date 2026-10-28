import { describe, expect, it, vi } from "vitest";
import fixtures from "./fixtures.json";
import { overall, spearman, variance } from "./metrics";
import { stripInventedQuotes } from "../guard";
import { segment } from "../segment";

vi.mock("server-only", () => ({}));

// Gates for the SOP rubric (plan: Spearman with human raters, test-retest variance, position flips).
const GATES = { spearman: 0.6, retestVariance: 0.25, flipRate: 0.25 };

const humanOverall = fixtures.drafts.map((d) => overall(d.human.map(overall)));

describe("writing eval (recorded responses)", () => {
  it("rubric scores rank drafts like human raters", () => {
    const model = fixtures.drafts.map((d) => overall(fixtures.recorded[d.id as keyof typeof fixtures.recorded].map(overall)));
    expect(spearman(model, humanOverall)).toBeGreaterThanOrEqual(GATES.spearman);
  });

  it("repeated reviews of the same draft agree (test-retest)", () => {
    for (const runs of Object.values(fixtures.recorded)) {
      expect(variance(runs.map(overall))).toBeLessThanOrEqual(GATES.retestVariance);
    }
  });

  it("pairwise comparisons do not flip with the order of the drafts", () => {
    const flips = fixtures.comparisons.filter((c) => (c.forward === "first") === (c.backward === "first")).length;
    expect(flips / fixtures.comparisons.length).toBeLessThanOrEqual(GATES.flipRate);
  });

  it("the guard strips invented wording from feedback and keeps quotes of the draft", () => {
    const draft = segment(fixtures.drafts[0]!.text).map((s) => s.text).join(" ");
    const [own, ghost] = fixtures.recorded_feedback as [string, string];
    expect(stripInventedQuotes(own, draft)).toBe(own);
    expect(stripInventedQuotes(ghost, draft)).toContain("[suggested wording removed");
  });
});

describe.runIf(process.env.LIVE_EVALS === "1" && process.env.ANTHROPIC_API_KEY)("writing eval (live)", () => {
  it("live rubric reviews rank drafts like human raters", { timeout: 300_000 }, async () => {
    const { reviewDraft } = await import("../review");
    const scores: number[] = [];
    for (const d of fixtures.drafts) {
      const run = await reviewDraft(segment(d.text), { kind: "statement_of_purpose", question: null, wordLimit: 500, programFacts: [] });
      expect(run.parsed).not.toBeNull();
      scores.push(overall(run.parsed!.criteria.map((c) => c.score)));
    }
    expect(spearman(scores, humanOverall)).toBeGreaterThanOrEqual(GATES.spearman);
  });
});

describe("metrics", () => {
  it("spearman handles ties and perfect order", () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(spearman([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2], [1, 1, 2])).toBeCloseTo(1);
  });
});
