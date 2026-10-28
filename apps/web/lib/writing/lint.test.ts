import { describe, expect, it } from "vitest";
import { lint } from "./lint";
import { segment } from "./segment";

describe("segment", () => {
  it("numbers sentences across paragraphs", () => {
    const s = segment("I built a parser. It failed twice.\n\nThen I read Knuth.");
    expect(s.map((x) => [x.id, x.paragraph, x.words])).toEqual([["S1", 1, 4], ["S2", 1, 3], ["S3", 2, 4]]);
  });
});

describe("lint", () => {
  it("flags cliches, claims and vague words with a question, never a rewrite", () => {
    const report = lint("Ever since I was a child I have been fascinated by computers. I am passionate about many things. In 2024 I cut our test suite from 41 to 9 minutes at Zoho.", 500);
    const kinds = report.flags.map((f) => `${f.sentence}:${f.kind}`);
    expect(kinds).toContain("S1:cliche");
    expect(kinds).toContain("S2:unsupported_claim");
    expect(report.flags.every((f) => f.question.endsWith("?"))).toBe(true);
    expect(report.specificity).toBeCloseTo(1 / 3);
  });

  it("counts words against the limit", () => {
    expect(lint("One two three four five six.", 5).overLimit).toBe(true);
    expect(lint("One two three.", 5).overLimit).toBe(false);
  });

  it("flags very long and passive sentences", () => {
    const long = `${"word ".repeat(45)}end.`;
    expect(lint(long, null).flags.map((f) => f.kind)).toContain("long");
    expect(lint("The model was trained by my team.", null).flags.map((f) => f.kind)).toContain("passive");
  });
});
