import { describe, expect, it } from "vitest";
import { courseLabel, courseOf } from "./own-application";

describe("courseOf", () => {
  it("names a catalogue course from its programme", () => {
    const app = { own_title: null, program_cycles: { programs: { title: "MSc Data Science", institutions: { name: "Exampleton" } } } };
    expect(courseOf(app)).toEqual({ title: "MSc Data Science", institution: "Exampleton", own: false });
    expect(courseLabel(app)).toBe("MSc Data Science, Exampleton");
  });

  it("names an own application from the student's words", () => {
    const app = { own_title: "MSc Urban Planning", own_institution: "Universiteit Voorbeeld", program_cycles: null };
    expect(courseOf(app)).toEqual({ title: "MSc Urban Planning", institution: "Universiteit Voorbeeld", own: true });
  });

  it("falls back to a neutral name when nothing is known", () => {
    expect(courseLabel(null)).toBe("Course");
  });
});
