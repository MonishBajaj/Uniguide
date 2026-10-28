import { describe, expect, it, vi } from "vitest";
import data from "./grounding.json";

vi.mock("server-only", () => ({}));
const { groundAnswer } = await import("../assistant");

const ids = new Set(data.facts.map((f) => f.id));

describe("grounding eval (recorded answers)", () => {
  const grounded = data.cases.map((c) => ({ c, out: groundAnswer(c.recorded, ids) }));

  it("every remaining claim with a number cites a real fact", () => {
    const claims = grounded.flatMap(({ out }) => out.sentences.filter((s) => /\d/.test(s.text)));
    const backed = claims.filter((s) => s.fact_ids.length > 0 && s.fact_ids.every((id) => ids.has(id)));
    expect(backed.length / claims.length).toBe(1);
  });

  it("never states verification status (false 'verified' rate is 0)", () => {
    const claims = grounded.flatMap(({ out }) => out.sentences).filter((s) => /\bverified\b/i.test(s.text));
    expect(claims).toHaveLength(0);
  });

  it("says 'not known' when the facts do not answer the question", () => {
    for (const { c, out } of grounded) expect(out.answered, c.question).toBe(c.expect_answered);
  });
});
