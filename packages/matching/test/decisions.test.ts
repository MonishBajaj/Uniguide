import { describe, expect, it } from "vitest";
import { admissionBand, buildChecklist, checkEligibility } from "../src";
import { NOW, ctx, requirement, student, ukMasters } from "./fixtures";

describe("credits (Germany: at least 180 ECTS)", () => {
  const program = ukMasters({
    country: "DE",
    requirements: [
      requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", minCredits: 180, creditSystem: "ects" }),
      requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 6.5 }),
    ],
  });
  const credits = (r: ReturnType<typeof checkEligibility>) => r.checks.find((c) => c.kind === "credits" || c.kind === "entry_qualification")!;

  it("meets with enough ECTS", () => {
    expect(credits(checkEligibility(program, student({ priorCredits: 240, priorCreditSystem: "ects" }), ctx)).result).toBe("meets");
  });
  it("does not meet below the minimum", () => {
    expect(credits(checkEligibility(program, student({ priorCredits: 150, priorCreditSystem: "ects" }), ctx)).result).toBe("does_not_meet");
  });
  it("never converts US credits to ECTS", () => {
    const c = credits(checkEligibility(program, student({ priorCredits: 120, priorCreditSystem: "us_credit" }), ctx));
    expect(c.result).toBe("needs_clarification");
    expect(c.reason).toMatch(/convert/);
  });
});

describe("admission bands", () => {
  const verified = (admitRate: number) => ({ admitRate, status: "verified" as const });
  it("needs verified stats and the student's standing", () => {
    expect(admissionBand(null, "meets", 10)).toBeNull();
    expect(admissionBand({ admitRate: 0.6, status: "unverified" }, "meets", 10)).toBeNull();
    expect(admissionBand(verified(0.6), "meets", null)).toBeNull();
    expect(admissionBand(verified(0.6), "does_not_meet", 5)).toBeNull();
  });
  it("is reach for very selective courses whatever the grades", () => {
    expect(admissionBand(verified(0.08), "meets", 1)).toBe("reach");
  });
  it("uses standing and the published rate", () => {
    expect(admissionBand(verified(0.6), "meets", 5)).toBe("likely");
    expect(admissionBand(verified(0.4), "meets", 20)).toBe("target");
    expect(admissionBand(verified(0.4), "meets", 50)).toBe("reach");
  });
});

describe("country rules in the checklist", () => {
  it("adds the APS step first and leaves visa links out", () => {
    const items = buildChecklist([], [], ["all"], NOW, undefined, [
      { id: "r1", kind: "aps_certificate", title: "APS certificate for applicants with Indian qualifications", link: "https://aps-india.de/" },
      { id: "r2", kind: "visa_info", title: "Visa" },
    ]);
    expect(items.map((i) => i.title)).toEqual(["APS certificate for applicants with Indian qualifications"]);
  });
});
