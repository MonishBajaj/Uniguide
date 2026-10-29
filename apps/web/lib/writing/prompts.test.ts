import { describe, expect, it } from "vitest";
import { OUTLINES, outlineFor, STORY_QUESTIONS } from "./prompts";
import { WAITLIST_STEPS } from "../waitlist";

describe("writing prompts", () => {
  it("every outline's word shares add up to the whole", () => {
    for (const [kind, sections] of Object.entries(OUTLINES)) {
      expect(sections.reduce((n, s) => n + s.share, 0), kind).toBeCloseTo(1, 5);
    }
  });

  it("the letter of continued interest asks for new information and an honest commitment, at a short length", () => {
    const outline = outlineFor("continued_interest", 300);
    expect(outline.map((s) => s.id)).toEqual(["commitment", "new", "fit", "close"]);
    expect(outline.find((s) => s.id === "new")!.words).toBe(150);
    expect(outline[0]!.questions.join(" ")).toMatch(/only if it is true/);
  });

  it("a supplemental essay's outline follows the type of the school's question", () => {
    const outline = outlineFor("supplemental", 200, "Why Stanford?");
    expect(outline.map((s) => [s.id, s.words])).toEqual([["specifics", 120], ["link", 80]]);
    expect(outlineFor("supplemental", null, "Tell us about a setback.").map((s) => s.id)).toEqual(["situation", "action", "change"]);
  });

  it("guidance only asks questions and states rules; it never promises an outcome", () => {
    const text = [...WAITLIST_STEPS.map((s) => s.body), ...OUTLINES.continued_interest!.flatMap((s) => s.questions)].join(" ");
    expect(text).not.toMatch(/guarantee|will get you in|increase your chances/i);
  });

  it("story questions have unique ids", () => {
    expect(new Set(STORY_QUESTIONS.map((q) => q.id)).size).toBe(STORY_QUESTIONS.length);
  });
});
