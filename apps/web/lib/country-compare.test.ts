import type { CountryRule } from "@uniguide/matching";
import { describe, expect, it } from "vitest";
import { compareCountries } from "./country-compare";

const rule = (over: Partial<CountryRule>): CountryRule => ({ id: over.title ?? "r", kind: "post_study_work", title: "t", destination: "GB", status: "verified", ...over });

describe("compareCountries", () => {
  it("builds a tuition range from several courses", () => {
    const [gb] = compareCountries(["GB"], [], [
      { country: "GB", amount: 20000, currency: "GBP" },
      { country: "GB", amount: 32000, currency: "GBP" },
      { country: "GB", amount: 25000, currency: "GBP" },
      { country: "DE", amount: 1, currency: "EUR" },
    ]);
    expect(gb.tuitionRange).toEqual({ low: 20000, high: 32000, currency: "GBP", courses: 3 });
  });

  it("uses the most common currency when a country mixes them", () => {
    const [x] = compareCountries(["GB"], [], [
      { country: "GB", amount: 20000, currency: "GBP" },
      { country: "GB", amount: 22000, currency: "GBP" },
      { country: "GB", amount: 99999, currency: "USD" },
    ]);
    expect(x.tuitionRange).toMatchObject({ currency: "GBP", courses: 2 });
  });

  it("missing values say not yet verified", () => {
    const [de] = compareCountries(["DE"], [], []);
    expect(de).toEqual({ code: "DE", tuitionRange: null, fundsRule: null, postStudy: null, workHours: null });
  });

  it("leaves unverified rules out", () => {
    const [gb] = compareCountries(["GB"], [rule({ title: "unverified", status: "unverified", months: 24 }), rule({ title: "ok", months: 24 })], []);
    expect(gb.postStudy?.title).toBe("ok");
    const [none] = compareCountries(["GB"], [rule({ status: "unverified" })], []);
    expect(none.postStudy).toBeNull();
  });

  it("keeps the requested order of countries", () => {
    expect(compareCountries(["US", "GB"], [], []).map((c) => c.code)).toEqual(["US", "GB"]);
  });

  it("never lets a rule for one residence or one region stand for the whole country", () => {
    const rules = [
      rule({ id: "in-only", kind: "work_hours", hoursPerWeek: 10, appliesTo: ["IN"] }),
      rule({ id: "london", kind: "proof_of_funds", amount: 1300, currency: "GBP", period: "per_month", region: "london" }),
    ];
    const [gb] = compareCountries(["GB"], rules, []);
    expect(gb.workHours).toBeNull();
    expect(gb.fundsRule).toBeNull();
  });

  it("prefers the most recently verified rule and needs an amount for funds", () => {
    const rules = [
      rule({ id: "untyped", kind: "proof_of_funds", amount: null }),
      rule({ id: "old", kind: "post_study_work", months: 24 }),
      rule({ id: "new", kind: "post_study_work", months: 36 }),
    ];
    const [gb] = compareCountries(["GB"], rules.map((r, i) => ({ ...r, verifiedAt: `2026-0${i + 1}-01` })), []);
    expect(gb.fundsRule).toBeNull();
    expect(gb.postStudy?.id).toBe("new");
  });
});
