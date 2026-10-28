import { describe, expect, it } from "vitest";
import { enforceCoaching, stripInventedQuotes } from "./guard";
import { segment } from "./segment";

const draft = "I rebuilt our clinic's booking system in 2025. Waiting times fell from 40 to 12 minutes.";

describe("guard", () => {
  it("removes suggested wording that the student did not write", () => {
    const out = stripInventedQuotes('Try opening with "My journey into healthcare technology began in a crowded clinic".', draft);
    expect(out).toContain("[suggested wording removed");
    expect(out).not.toContain("My journey");
  });

  it("keeps quotes of the student's own sentences", () => {
    const text = 'You wrote "Waiting times fell from 40 to 12 minutes" which is concrete.';
    expect(stripInventedQuotes(text, draft)).toBe(text);
  });

  it("drops evidence ids that do not exist, clamps scores and fixes questions", () => {
    const sentences = segment(draft);
    const result = enforceCoaching(
      {
        criteria: [
          { criterion: "specific_evidence", score: 7, evidence: ["S2", "S9"], observation: "ok", question: "What did you measure" },
          { criterion: "program_fit", score: 4, evidence: ["S7"], observation: "none", question: "Why here?" },
        ],
        strongest_sentence: "S12",
        biggest_question: "What changed for patients?",
      },
      sentences,
    );
    expect(result.criteria[0]).toMatchObject({ score: 5, evidence: ["S2"], question: "What did you measure?" });
    expect(result.criteria[1]).toMatchObject({ score: 1, evidence: [] });
    expect(result.strongest_sentence).toBe("");
  });
});
