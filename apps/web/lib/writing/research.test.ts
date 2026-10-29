import { describe, expect, it } from "vitest";
import { researchChecks } from "./research";

describe("researchChecks", () => {
  it("finds a question stated as a question or as an aim", () => {
    const draft = "Hospitals lose hours to bad rosters. Can scheduling under uncertainty cut overtime?\n\nI aim to investigate whether shift swaps predict burnout.";
    expect(researchChecks(draft).questionSentences).toEqual(["S2", "S3"]);
  });
  it("finds nothing in a draft that only describes interest", () => {
    const draft = "I have always loved data. Your department is world-class and I would thrive there.";
    expect(researchChecks(draft)).toEqual({ questionSentences: [], methods: [] });
  });
  it("names the methods the draft mentions, in any spelling or case", () => {
    const draft = "I would run a Randomized controlled trial, then semi-structured interviews and Difference in differences on panel data.";
    expect(researchChecks(draft).methods).toEqual(["interview", "randomized", "controlled trial", "difference-in-differences", "panel data"]);
  });
});
