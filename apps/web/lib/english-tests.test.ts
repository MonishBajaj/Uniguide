import { describe, expect, it } from "vitest";
import { byExam, type LanguageRow } from "./english-tests";

let n = 0;
const row = (over: Partial<LanguageRow> = {}): LanguageRow => ({
  id: `r${n++}`,
  programSlug: "msc-x",
  programTitle: "MSc X",
  institution: "X University",
  country: "GB",
  exam: "ielts_academic",
  examVersion: null,
  minTotal: 6.5,
  minSections: null,
  status: "verified",
  testPolicy: null,
  ...over,
});

describe("byExam", () => {
  it("groups by exam, most courses first, courses by country then title", () => {
    const r = byExam([
      row({ exam: "toefl_ibt", examVersion: "2026-01", programTitle: "B", country: "US" }),
      row({ programTitle: "Z", country: "GB" }),
      row({ programTitle: "A", country: "GB" }),
      row({ programTitle: "M", country: "AU" }),
    ]);
    expect(r.map((g) => g.exam)).toEqual(["ielts_academic", "toefl_ibt"]);
    expect(r[0].courses.map((c) => c.programTitle)).toEqual(["M", "A", "Z"]);
  });

  it("keeps section-only minimums", () => {
    const r = byExam([row({ minTotal: null, minSections: { writing: 6 } })]);
    expect(r[0].courses).toHaveLength(1);
    expect(r[0].courses[0].minSections).toEqual({ writing: 6 });
  });

  it("never merges different versions of one exam", () => {
    const r = byExam([row({ exam: "toefl_ibt", examVersion: "legacy" }), row({ exam: "toefl_ibt", examVersion: "2026-01" })]);
    expect(r.map((g) => `${g.exam}:${g.examVersion}`).sort()).toEqual(["toefl_ibt:2026-01", "toefl_ibt:legacy"]);
  });
});
