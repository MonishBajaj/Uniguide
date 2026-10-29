import { describe, expect, it } from "vitest";
import { STORY_QUESTIONS } from "./prompts";
import { classifyPrompt, PROMPT_TYPES, type PromptType } from "./supplemental";

const CASES: [string, PromptType][] = [
  ["Why do you want to attend Northwestern? (300 words)", "why_us"],
  ["Why Stanford?", "why_us"],
  ["What attracts you to our MSc programme?", "why_us"],
  ["Please explain why you are interested in this program and how it fits your goals.", "why_us"],
  ["Describe a challenge, setback or failure you have faced. How did it affect you?", "challenge"],
  ["Tell us about a time you overcame an obstacle.", "challenge"],
  ["Describe the world you come from — for example your family, community or school.", "community"],
  ["How will your background and perspective contribute to the diversity of our class?", "community"],
  ["What are your short- and long-term career goals?", "goals"],
  ["What do you plan to do after you graduate?", "goals"],
  ["Briefly elaborate on one of your extracurricular activities or work experiences.", "activity"],
  ["Describe a project you are proud of.", "activity"],
  ["What is your favourite word, and why?", "other"],
  ["Why is failure important to learning? Give an example.", "challenge"],
  ["Why do you want to study computer science?", "goals"],
  ["Why do you want to study at Imperial?", "why_us"],
  ["Why are you a good fit for a career in medicine?", "goals"],
];

describe("classifyPrompt", () => {
  it.each(CASES)("%s → %s", (question, type) => {
    expect(classifyPrompt(question)).toBe(type);
  });
});

describe("PROMPT_TYPES", () => {
  it("only points at story questions that exist", () => {
    const ids = new Set(STORY_QUESTIONS.map((q) => q.id));
    for (const t of Object.values(PROMPT_TYPES)) for (const s of t.stories) expect(ids.has(s)).toBe(true);
  });
  it("splits the whole word budget", () => {
    for (const t of Object.values(PROMPT_TYPES)) expect(t.outline.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1);
  });
  it("asks questions instead of giving sentences to copy", () => {
    for (const t of Object.values(PROMPT_TYPES)) for (const q of t.strategy) expect(q).toMatch(/\?/);
  });
});
