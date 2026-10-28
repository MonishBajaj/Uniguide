import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admissionEstimate, type AdmissionModelParams } from "../src";

// The same fixture is checked by the worker's tests, so both sides compute identical estimates.
const fixture = JSON.parse(readFileSync(new URL("../../../data/fixtures/admission-model.json", import.meta.url), "utf8")) as {
  params: AdmissionModelParams;
  min_program_n: number;
  cases: { program_id: string; country: string; grade_value: number; grade_scale: string; expected: number | null }[];
};

describe("admissionEstimate", () => {
  it.each(fixture.cases)("matches the worker for $program_id on $grade_scale", (c) => {
    const est = admissionEstimate(fixture.params, fixture.min_program_n, { id: c.program_id, country: c.country }, {
      gradeValue: c.grade_value,
      gradeScale: c.grade_scale,
    });
    if (c.expected == null) expect(est).toBeNull();
    else expect(est!.probability).toBeCloseTo(c.expected, 4);
  });

  it("gives no estimate for a course below the minimum count", () => {
    expect(admissionEstimate(fixture.params, 30, { id: "p-de", country: "DE" }, { gradeValue: 1.8, gradeScale: "german_1_5" })).toBeNull();
  });
});
