import { describe, expect, it } from "vitest";
import { rulesFor, type CountryRule } from "../src";

const rule = (over: Partial<CountryRule> = {}): CountryRule => ({
  id: "r1",
  kind: "visa_step",
  title: "A rule",
  destination: "DE",
  appliesTo: [],
  status: "verified",
  ...over,
});

describe("rulesFor", () => {
  const rules = [
    rule({ id: "aps", kind: "aps_certificate", appliesTo: ["IN"] }),
    rule({ id: "all", kind: "visa_step" }),
    rule({ id: "gb", destination: "GB", kind: "visa_step" }),
  ];

  it("applies_to filters by residence", () => {
    expect(rulesFor(rules, "DE", "IN").map((r) => r.id)).toEqual(["aps", "all"]);
    expect(rulesFor(rules, "DE", "US").map((r) => r.id)).toEqual(["all"]);
    expect(rulesFor(rules, "DE", null).map((r) => r.id)).toEqual(["all"]);
  });

  it("filters by destination", () => {
    expect(rulesFor(rules, "GB", null).map((r) => r.id)).toEqual(["gb"]);
  });

  it("filters by kind", () => {
    expect(rulesFor(rules, "DE", "IN", "aps_certificate").map((r) => r.id)).toEqual(["aps"]);
  });
});
