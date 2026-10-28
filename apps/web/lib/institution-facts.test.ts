import { describe, expect, it } from "vitest";
import { arrivalSections, describeAmount, factsFor, groupByKind, type InstitutionFact } from "./institution-facts";

let n = 0;
const fact = (over: Partial<InstitutionFact> = {}): InstitutionFact => ({
  id: `f${n++}`,
  kind: "assistantship",
  title: "t",
  details: null,
  amount: null,
  currency: null,
  period: null,
  hoursPerWeek: null,
  link: null,
  status: "verified",
  evidenceQuote: "quote",
  programId: null,
  ...over,
});

describe("factsFor", () => {
  it("returns institution-wide facts and the program's own", () => {
    const r = factsFor([fact({ id: "wide" }), fact({ id: "mine", programId: "p1" })], "p1", ["assistantship"]);
    expect(r.map((f) => f.id)).toEqual(["wide", "mine"]);
  });

  it("program facts stay on their program", () => {
    const r = factsFor([fact({ id: "other", programId: "p2" }), fact({ id: "wide" })], "p1", ["assistantship"]);
    expect(r.map((f) => f.id)).toEqual(["wide"]);
  });

  it("filters by kind", () => {
    const r = factsFor([fact({ id: "a" }), fact({ id: "b", kind: "parking" })], "p1", ["parking"]);
    expect(r.map((f) => f.id)).toEqual(["b"]);
  });
});

describe("arrivalSections", () => {
  it("orders airport, arrival support and registration, and drops empty sections", () => {
    const r = arrivalSections([fact({ id: "r", kind: "course_registration" }), fact({ id: "a", kind: "airport" })]);
    expect(r.map((s) => s.kind)).toEqual(["airport", "course_registration"]);
    expect(r[0].facts.map((f) => f.id)).toEqual(["a"]);
  });
});

describe("describeAmount", () => {
  it("states the amount with its own period and never converts it", () => {
    expect(describeAmount(fact({ amount: 700, currency: "GBP", period: "per_month" }))).toBe("£700 a month");
    expect(describeAmount(fact({ amount: 50, currency: "GBP", period: "per_term" }))).toBe("£50 a term");
    expect(describeAmount(fact({ amount: 900, currency: "GBP", period: "per_year" }))).toBe("£900 a year");
    expect(describeAmount(fact({ amount: 40, currency: "GBP", period: "one_off" }))).toBe("£40 one off");
  });
  it("is null when the fact has no amount", () => expect(describeAmount(fact())).toBeNull());
});

describe("groupByKind", () => {
  it("orders groups as asked and drops the empty ones", () => {
    const r = groupByKind([fact({ id: "p", kind: "parking" }), fact({ id: "h", kind: "housing_on_campus" })], ["housing_on_campus", "housing_off_campus", "parking"]);
    expect(r.map((g) => g.kind)).toEqual(["housing_on_campus", "parking"]);
  });
});
