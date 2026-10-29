import { describe, expect, it } from "vitest";
import { compareProfile } from "../src";
import { ctx, requirement, student, ukMasters } from "./fixtures";

const entry = (over = {}) => ({ program: ukMasters(), title: "MSc A", admitRate: null as { rate: number; status: string } | null, ...over });

describe("compareProfile", () => {
  it("says whether the grade meets the published minimum on the same scale", () => {
    expect(compareProfile(student({ gradeValue: 72 }), [entry()], ctx)[0]!.grade).toBe("meets");
    expect(compareProfile(student({ gradeValue: 50 }), [entry()], ctx)[0]!.grade).toBe("below");
  });

  it("does not compare grades on different scales", () => {
    expect(compareProfile(student({ gradeValue: 3.5, gradeScale: "gpa_4" }), [entry()], ctx)[0]!.grade).toBe("unknown");
  });

  it("shows only a verified admit rate", () => {
    expect(compareProfile(student(), [entry({ admitRate: { rate: 0.3, status: "unverified" } })], ctx)[0]!.admitRate).toBeNull();
    expect(compareProfile(student(), [entry({ admitRate: { rate: 0.3, status: "verified" } })], ctx)[0]!.admitRate).toBe(0.3);
  });

  it("returns one row per course in the order given", () => {
    const rows = compareProfile(student(), [entry({ title: "B" }), entry({ title: "A" })], ctx);
    expect(rows.map((r) => r.title)).toEqual(["B", "A"]);
  });

  it("judges the grade on its own when the course also asks for credits the student has not entered", () => {
    const program = ukMasters({
      requirements: [
        requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", minGradeNumeric: 60, gradeScale: "percent", minGradeText: "60%" }),
        requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", minCredits: 180, creditSystem: "ects" }),
      ],
    });
    expect(compareProfile(student({ gradeValue: 72 }), [entry({ program })], ctx)[0]!.grade).toBe("meets");
  });

  it("reports the English test verdict", () => {
    expect(compareProfile(student(), [entry()], ctx)[0]!.language).toBe("meets");
    expect(compareProfile(student({ testScores: [] }), [entry()], ctx)[0]!.language).not.toBe("meets");
  });
});
