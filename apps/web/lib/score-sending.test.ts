import { describe, expect, it } from "vitest";
import { scoreNeeds, sentProgress } from "./score-sending";

const req = (kind: string, exam: string, test_policy: string | null = null) => ({ kind, exam, test_policy });

describe("score sending", () => {
  const needs = scoreNeeds([
    req("language_test", "ielts_academic"),
    req("language_test", "toefl_ibt"),
    req("language_test", "duolingo", "not_accepted"),
    req("admissions_test", "gre", "required"),
    req("admissions_test", "gmat", "optional"),
    { kind: "entry_qualification", exam: null, test_policy: null },
  ]);

  it("groups accepted language tests as alternatives and lists admissions tests separately", () => {
    expect(needs.map((n) => [n.key, n.required])).toEqual([["language", true], ["gre", true], ["gmat", false]]);
    expect(needs[0]!.label).toBe("a language test (IELTS Academic or TOEFL iBT)");
    expect(needs[0]!.exams).not.toContain("duolingo");
  });

  it("counts only required needs, met by any accepted exam", () => {
    expect(sentProgress(needs, [])).toEqual({ sent: 0, needed: 2 });
    expect(sentProgress(needs, ["toefl_ibt"])).toEqual({ sent: 1, needed: 2 });
    expect(sentProgress(needs, ["toefl_ibt", "gmat"])).toEqual({ sent: 1, needed: 2 });
    expect(sentProgress(needs, ["ielts_academic", "gre"])).toEqual({ sent: 2, needed: 2 });
  });

  it("needs nothing when the course publishes no tests", () => {
    expect(scoreNeeds([])).toEqual([]);
    expect(sentProgress([], ["gre"])).toEqual({ sent: 0, needed: 0 });
  });
});
