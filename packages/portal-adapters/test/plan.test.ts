// planPage (plan A2.2): on one page, what guided apply fills, what it lists for the student, and whether it
// pauses afterwards, and why.
import { describe, expect, it } from "vitest";
import { matchPage, planPage, type PlanField } from "../src/index";
import { practice } from "../src/practice/index";
import { fixture, page, profile } from "./helpers";

/** The page's fields, as the content script would describe them, with what's already in each. */
function fields(doc: Document): PlanField[] {
  return matchPage(doc, practice).map(({ element, ...f }) => {
    const el = element as HTMLInputElement;
    const hasValue =
      f.control === "radio"
        ? !!doc.querySelector(`input[name="${f.name}"]:checked`)
        : f.control === "checkbox"
          ? el.checked
          : el.value.trim() !== "";
    return { ...f, hasValue };
  });
}

describe("filling what it's sure of", () => {
  it("fills every confident field with a confirmed value, exactly as stored", () => {
    const plan = planPage(fields(fixture("schooling")), profile(), practice, []);
    expect(plan.toFill).toEqual([
      { key: "field-qualification", value: "cbse_12", role: "education.qualification", source: "education.qualification" },
      { key: "field-grade_scale", value: "percentage", role: "education.grade.scale", source: "education.grade.scale" },
      { key: "field-grade_value", value: "91.4", role: "education.grade.value", source: "education.grade.value" },
    ]);
  });

  it("never fills over what's already in a field", () => {
    const doc = fixture("about-you");
    (doc.getElementById("field-email") as HTMLInputElement).value = "mine@example.com";
    const plan = planPage(fields(doc), profile(), practice, []);
    expect(plan.toFill.map((f) => f.key)).not.toContain("field-email");
    expect(plan.listed).toContainEqual(expect.objectContaining({ key: "field-email", reason: "already_filled" }));
  });

  it("fills repeated entries in order", () => {
    const plan = planPage(fields(fixture("activities")), profile(), practice, []);
    expect(plan.toFill).toEqual([
      { key: "field-activity_1_role", index: 1, value: "Robotics club lead", role: "activities[].role", source: "activities[0].title" },
      { key: "field-activity_1_organisation", index: 1, value: "City School", role: "activities[].organisation", source: "activities[0].organisation" },
    ]);
  });
});

describe("essays", () => {
  it("lists the statement as the student's essay and pauses for it, with or without a final draft", () => {
    for (const finalDrafts of [[], [{ documentId: "d", kind: "personal_statement", title: null, question: null, versionId: "v", wordCount: 100 }]]) {
      const plan = planPage(fields(fixture("statement")), profile({ finalDrafts }), practice, []);
      expect(plan.toFill).toEqual([]);
      expect(plan.listed).toEqual([{ key: "field-statement", label: "Why do you want to study this course?", role: "essay.personal_statement", reason: "essay" }]);
      expect(plan.pause).toEqual({ reason: "student", fields: ["field-statement"] });
    }
  });
});

describe("pausing for the student", () => {
  it("pauses for required fields only the student fills, after filling the rest", () => {
    const plan = planPage(fields(fixture("about-you")), profile(), practice, []);
    expect(plan.toFill.map((f) => f.key)).toEqual(["field-email", "field-country_of_residence"]);
    expect(plan.pause).toEqual({ reason: "student", fields: ["field-given_names", "field-family_name", "field-date_of_birth"] });
    // The phone number is optional: listed, but no reason to pause.
    expect(plan.listed).toContainEqual(expect.objectContaining({ key: "field-phone", reason: "student" }));
  });

  it("doesn't pause once the student has filled those fields", () => {
    const doc = fixture("about-you");
    (doc.getElementById("field-given_names") as HTMLInputElement).value = "Test";
    (doc.getElementById("field-family_name") as HTMLInputElement).value = "Student";
    (doc.getElementById("field-date_of_birth") as HTMLInputElement).value = "2007-05-01";
    expect(planPage(fields(doc), profile(), practice, []).pause).toBeNull();
  });

  it("pauses for a required field without a confirmed value", () => {
    const empty = profile({ education: { qualification: "cbse", grade: { value: null, text: null, scale: "percent" }, priorCredits: { value: null, system: null } } });
    const plan = planPage(fields(fixture("schooling")), empty, practice, []);
    expect(plan.pause?.reason).toBe("no_value");
    expect(plan.pause?.fields).toContain("field-grade_value");
  });

  it("pauses when the portal wants a format the student hasn't entered", () => {
    const uk = profile({ education: { qualification: "bachelor_3yr", grade: { value: null, text: "2:1", scale: "uk_class" }, priorCredits: { value: null, system: null } } });
    const plan = planPage(fields(fixture("schooling")), uk, practice, []);
    expect(plan.pause?.reason).toBe("format_differs");
    expect(plan.pause?.fields).toEqual(expect.arrayContaining(["field-qualification", "field-grade_scale"]));
  });

  it("pauses for a required field it can't confidently match", () => {
    const doc = fixture("about-you");
    doc.querySelector("form[data-page]")!.insertAdjacentHTML("beforeend", `<label for="q">Favourite colour</label><input id="q" name="q" required>`);
    const plan = planPage(fields(doc), profile(), practice, ["field-given_names", "field-family_name", "field-date_of_birth"]);
    expect(plan.pause).toEqual({ reason: "no_match", fields: ["q"] });
  });

  it("puts the gravest reason first: a declaration outranks a missing name", () => {
    const doc = fixture("about-you");
    doc.querySelector("form[data-page]")!.insertAdjacentHTML("beforeend", `<label><input type="checkbox" id="d" name="d"> I declare this is true</label>`);
    expect(planPage(fields(doc), profile(), practice, []).pause?.reason).toBe("declaration");
  });

  it("leaves a field the student skipped, without pausing for it", () => {
    const plan = planPage(fields(fixture("about-you")), profile(), practice, ["field-given_names", "field-family_name", "field-date_of_birth"]);
    expect(plan.pause).toBeNull();
    expect(plan.listed).toContainEqual(expect.objectContaining({ key: "field-given_names", reason: "skipped" }));
  });

  it("counts an unknown optional field as listed, not a reason to stop", () => {
    const doc = page(`<label for="n">Nickname</label><input id="n" name="n">`);
    const plan = planPage(
      [{ key: "n", name: "n", control: "text", label: "Nickname", role: null, confidence: 0, via: "none", action: "student", required: false, visible: true, hasValue: false }],
      profile(),
      practice,
      [],
    );
    expect(doc).toBeTruthy();
    expect(plan.pause).toBeNull();
    expect(plan.listed).toEqual([{ key: "n", label: "Nickname", role: null, reason: "no_match" }]);
  });
});
