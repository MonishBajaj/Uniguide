import type { CountryRule } from "@uniguide/matching";
import { describe, expect, it } from "vitest";
import { orderSteps } from "./visa-steps";

const rule = (over: Partial<CountryRule>): CountryRule => ({ id: over.title ?? "x", kind: "visa_step", title: "t", destination: "DE", ...over });

describe("orderSteps", () => {
  it("keeps only visa steps, by step number", () => {
    const r = orderSteps([
      rule({ title: "second", step: 2 }),
      rule({ title: "funds", kind: "proof_of_funds", step: 0 }),
      rule({ title: "first", step: 1 }),
    ]);
    expect(r.map((s) => s.title)).toEqual(["first", "second"]);
  });

  it("stable order for equal steps", () => {
    const r = orderSteps([rule({ title: "b", step: 1 }), rule({ title: "a", step: 1 }), rule({ title: "c", step: 1 })]);
    expect(r.map((s) => s.title)).toEqual(["a", "b", "c"]);
  });

  it("puts steps without a number last", () => {
    const r = orderSteps([rule({ title: "later", step: null }), rule({ title: "first", step: 1 })]);
    expect(r.map((s) => s.title)).toEqual(["first", "later"]);
  });
});
