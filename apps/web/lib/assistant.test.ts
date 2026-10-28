import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { groundAnswer, onlyKnownNumbers, quotedUpdates } = await import("./assistant");

describe("match explanations", () => {
  it("accept only numbers that the scorer produced", () => {
    const source = JSON.stringify({ score: 82, base_cost: 47100, rule: "budget" });
    expect(onlyKnownNumbers("It scores 82 and costs about 47,100 in total.", source)).toBe(true);
    expect(onlyKnownNumbers("You have a 70% chance of admission.", source)).toBe(false);
  });
});

describe("course Q&A grounding", () => {
  it("drops invented fact ids and uncited sentences with numbers", () => {
    const out = groundAnswer(
      {
        answered: true,
        sentences: [
          { text: "The IELTS minimum is 6.5.", fact_ids: ["F2"] },
          { text: "Tuition is about £30,000.", fact_ids: ["F99"] },
          { text: "Check the official page for details.", fact_ids: [] },
        ],
      },
      new Set(["F1", "F2"]),
    );
    expect(out.sentences.map((s) => s.text)).toEqual(["The IELTS minimum is 6.5.", "Check the official page for details."]);
    expect(out.answered).toBe(true);
  });

  it("is not answered when nothing is cited", () => {
    expect(groundAnswer({ answered: true, sentences: [{ text: "It is a good course.", fact_ids: [] }] }, new Set(["F1"])).answered).toBe(false);
  });
});

describe("onboarding", () => {
  it("keeps only updates the student actually said", () => {
    const updates = quotedUpdates(
      {
        reply: "Thanks. Which countries?",
        updates: [
          { field: "grade_value", value: "8.7", confidence: 0.9, quote: "8.7 CGPA" },
          { field: "budget_amount", value: "50000", confidence: 0.6, quote: "about 50k" },
        ],
      },
      "I finished my B.Tech with 8.7 CGPA out of 10.",
    );
    expect(updates.map((u) => u.field)).toEqual(["grade_value"]);
  });
});
