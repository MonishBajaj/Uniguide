import { describe, expect, it } from "vitest";
import { CATALOGUE, COPY, PARENT_HI, REASON_MAX, TITLE_MAX, renderParentTitle, renderStep } from "../src";

// Journey M6 (J6.2): every step reads in Hindi, with the same facts in it as the English.
const placeholders = (t: string) => new Set([...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));
// English grammar ("item" or "items") with no Hindi equivalent; everything else carries data and must appear.
const GRAMMAR = new Set(["items"]);
const LONG = "A".repeat(120);

describe("Hindi step copy", () => {
  it("has a Hindi template for every English key", () => {
    expect(Object.keys(COPY.hi).sort()).toEqual(Object.keys(COPY.en).sort());
  });

  for (const [key, en] of Object.entries(COPY.en)) {
    it(`${key} uses the same placeholders and fits`, () => {
      const hi = COPY.hi[key]!;
      for (const part of ["title", "reason"] as const) {
        const want = [...placeholders(en[part])].filter((p) => !GRAMMAR.has(p));
        expect([...placeholders(hi[part])].sort(), `${key} ${part}`).toEqual(want.sort());
      }
      // With every value 120 characters long, the result still fits; the sentence itself is never cut.
      const params = Object.fromEntries([...placeholders(en.title), ...placeholders(en.reason)].map((p) => [p, LONG]));
      const out = renderStep("hi", key, params);
      expect(out.title.length).toBeLessThanOrEqual(TITLE_MAX);
      expect(out.reason.length).toBeLessThanOrEqual(REASON_MAX);
      const short = renderStep("hi", key, Object.fromEntries(Object.keys(params).map((p) => [p, "X"])));
      expect(short.title.endsWith("…") || short.reason.endsWith("…"), `${key} is too long in Hindi`).toBe(false);
    });
  }

  it("keeps the course name as it is, and English for English readers", () => {
    const course = "MSc Physics, University X";
    expect(renderStep("hi", "S3.04", { course }).title).toBe(`${course} का इनटेक पक्का करें`);
    expect(renderStep("en", "S3.04", { course }).title).toBe(`Confirm the intake for ${course}`);
  });
});

describe("Hindi parent titles", () => {
  const withParent = CATALOGUE.filter((d) => d.parentTitle);

  it("has one for every step a parent can see, and no others", () => {
    expect(Object.keys(PARENT_HI).sort()).toEqual(withParent.map((d) => d.id).sort());
  });

  for (const d of withParent) {
    it(`${d.id} uses the same placeholders and fits`, () => {
      expect([...placeholders(PARENT_HI[d.id]!)].sort()).toEqual([...placeholders(d.parentTitle!)].sort());
      const params = Object.fromEntries([...placeholders(d.parentTitle!)].map((p) => [p, LONG]));
      expect(renderParentTitle("hi", d.id, params)!.length).toBeLessThanOrEqual(TITLE_MAX);
    });
  }

  it("leaves English parents with the saved English title", () => {
    expect(renderParentTitle("en", "S4.01", { course: "MSc X" })).toBeNull();
  });
});
