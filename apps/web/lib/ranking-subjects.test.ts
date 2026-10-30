import { describe, expect, it } from "vitest";
import { FIELDS } from "./fields";
import { QS_SUBJECTS_2026 } from "./qs-subjects";
import { candidateFilters, FIELD_TO_QS_SUBJECTS, rankingSubjects } from "./ranking-subjects";

const ICT = ["Computer Science & Information Systems", "Data Science and Artificial Intelligence"];

describe("FIELD_TO_QS_SUBJECTS", () => {
  it("covers every broad field a student can pick", () => {
    for (const code of Object.keys(FIELDS)) expect(FIELD_TO_QS_SUBJECTS[code]?.length, code).toBeGreaterThan(0);
  });

  it("names only subjects that exist in the 2026 workbook", () => {
    for (const [code, subjects] of Object.entries(FIELD_TO_QS_SUBJECTS)) {
      for (const subject of subjects) expect(QS_SUBJECTS_2026, `${code}: ${subject}`).toContain(subject);
    }
  });
});

describe("rankingSubjects", () => {
  it("maps ICT to the two computing subjects", () => {
    expect(rankingSubjects(["06"])).toEqual(ICT);
  });

  it("lists a subject shared by two fields once", () => {
    const merged = rankingSubjects(["03", "04"]);
    expect(merged.filter((s) => s === "Economics & Econometrics")).toHaveLength(1);
  });

  it("ignores field codes it does not know", () => {
    expect(rankingSubjects(["99"])).toEqual([]);
  });
});

describe("candidateFilters", () => {
  const base = { target_levels: ["master"], target_countries: ["US"] };

  it("leaves subject out when the student chose no field", () => {
    expect(candidateFilters({ ...base, target_fields: [] })).toEqual({
      p_levels: ["master"],
      p_countries: ["US"],
      p_fields: undefined,
      p_rank_subjects: undefined,
    });
  });

  it("passes the fields and their QS subjects", () => {
    const f = candidateFilters({ ...base, target_fields: ["06"] });
    expect(f.p_fields).toEqual(["06"]);
    expect(f.p_rank_subjects).toEqual(ICT);
  });

  it("filters by an unknown field but does not rank by it", () => {
    const f = candidateFilters({ ...base, target_fields: ["99"] });
    expect(f.p_fields).toEqual(["99"]);
    expect(f.p_rank_subjects).toBeUndefined();
  });

  it("leaves countries out when none are chosen, as before", () => {
    expect(candidateFilters({ target_levels: ["master"], target_countries: [], target_fields: [] }).p_countries).toBeUndefined();
  });
});
