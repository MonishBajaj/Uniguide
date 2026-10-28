import { describe, expect, it } from "vitest";
import { profileChecklist, type ProfileFields } from "./profile-completeness";

const empty: ProfileFields = {
  home_qualification: null, grade_value: null, grade_text: null, grade_scale: null, budget_amount: null, budget_currency: null,
  target_levels: [], target_countries: [], target_fields: [], research_interests: null,
};

describe("profile checklist", () => {
  it("lists everything as missing for a new profile", () => {
    const items = profileChecklist(empty, 0);
    expect(items.map((i) => i.key)).toEqual(["qualification", "level", "countries", "fields", "budget", "tests"]);
    expect(items.every((i) => !i.done)).toBe(true);
  });

  it("needs the grade scale with the grade, and the currency with the budget", () => {
    const partial = { ...empty, home_qualification: "bachelor_4yr", grade_value: 8.4, budget_amount: 60000 };
    const done = Object.fromEntries(profileChecklist(partial, 0).map((i) => [i.key, i.done]));
    expect(done.qualification).toBe(false);
    expect(done.budget).toBe(false);
    const fixed = Object.fromEntries(profileChecklist({ ...partial, grade_scale: "gpa_10", budget_currency: "USD" }, 1).map((i) => [i.key, i.done]));
    expect([fixed.qualification, fixed.budget, fixed.tests]).toEqual([true, true, true]);
  });

  it("accepts a grade written as text, like a UK degree class", () => {
    const p = { ...empty, home_qualification: "bachelor_3yr", grade_text: "2:1", grade_scale: "uk_class" };
    expect(profileChecklist(p, 0).find((i) => i.key === "qualification")!.done).toBe(true);
  });

  it("asks for research interests only from doctorate applicants", () => {
    expect(profileChecklist({ ...empty, target_levels: ["master"] }, 0).some((i) => i.key === "research")).toBe(false);
    const phd = profileChecklist({ ...empty, target_levels: ["doctorate"], research_interests: "  " }, 0);
    expect(phd.find((i) => i.key === "research")!.done).toBe(false);
  });
});
