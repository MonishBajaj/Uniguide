import { describe, expect, it } from "vitest";
import { matchPage, resolveValue, type FieldMatch, type FillProfile } from "../src/index";
import { practice } from "../src/practice/index";
import { fixture, profile } from "./helpers";

function field(state: string, role: string, index?: number): FieldMatch {
  const m = matchPage(fixture(state), practice).find((x) => x.role === role && (index === undefined || x.index === index));
  if (!m) throw new Error(`no ${role} on ${state}`);
  return m;
}
const resolve = (state: string, role: string, p: FillProfile = profile(), index?: number) =>
  resolveValue(field(state, role, index), p, practice);

describe("facts, exactly as stored", () => {
  it("fills email and residence country from the profile, with their source", () => {
    expect(resolve("about-you", "contact.email")).toEqual({ status: "value", value: "tester@practice.test", source: "contact.email" });
    expect(resolve("about-you", "contact.residence_country")).toEqual({ status: "value", value: "IN", source: "contact.residenceCountry" });
  });

  it("chooses the portal's option that means the same as our code, and nothing else", () => {
    expect(resolve("schooling", "education.qualification")).toMatchObject({ status: "value", value: "cbse_12" });
    expect(resolve("schooling", "education.grade.scale")).toMatchObject({ status: "value", value: "percentage" });
  });

  it("gives the grade exactly as entered, never converted", () => {
    expect(resolve("schooling", "education.grade.value")).toEqual({ status: "value", value: "91.4", source: "education.grade.value" });
    const cgpa = profile({ education: { qualification: "bachelor_4yr", grade: { value: 8.7, text: "8.7/10", scale: "gpa_10" }, priorCredits: { value: null, system: null } } });
    expect(resolve("schooling", "education.grade.value", cgpa)).toMatchObject({ value: "8.7" });
    expect(resolve("schooling", "education.grade.scale", cgpa)).toMatchObject({ value: "gpa_10" });
  });

  it("uses the grade text when the student entered only text", () => {
    const uk = profile({ education: { qualification: "bachelor_3yr", grade: { value: null, text: "2:1", scale: "uk_class" }, priorCredits: { value: null, system: null } } });
    expect(resolve("schooling", "education.grade.value", uk)).toEqual({ status: "value", value: "2:1", source: "education.grade.text" });
  });

  it("asks the student when the grade's scale isn't among the portal's options", () => {
    const uk = profile({ education: { qualification: "bachelor_3yr", grade: { value: null, text: "2:1", scale: "uk_class" }, priorCredits: { value: null, system: null } } });
    expect(resolve("schooling", "education.grade.scale", uk)).toEqual({ status: "needs_student", reason: "format_differs" });
    expect(resolve("schooling", "education.qualification", uk)).toEqual({ status: "needs_student", reason: "format_differs" });
  });

  it("asks the student when a country isn't among the options, rather than picking 'Somewhere else'", () => {
    expect(resolve("about-you", "contact.residence_country", profile({ contact: { email: "x@y.z", residenceCountry: "FR" } }))).toEqual({
      status: "needs_student",
      reason: "format_differs",
    });
  });

  it("asks the student when there's no value", () => {
    expect(resolve("schooling", "education.grade.value", profile({ education: { qualification: null, grade: { value: null, text: null, scale: null }, priorCredits: { value: null, system: null } } }))).toEqual({
      status: "needs_student",
      reason: "no_value",
    });
  });
});

describe("tests and activities", () => {
  it("uses the most recent English test, and only an English test", () => {
    expect(resolve("tests--taken", "tests.english.taken")).toMatchObject({ status: "value", value: "yes" });
    expect(resolve("tests--taken", "tests.english.exam")).toMatchObject({ status: "value", value: "ielts_academic", source: "testScores[0].exam" });
    expect(resolve("tests--taken", "tests.english.total")).toMatchObject({ value: "7.5" });
    expect(resolve("tests--taken", "tests.english.taken_on")).toMatchObject({ value: "2026-06-12" });
  });

  it("doesn't answer 'no' for the student when we know of no English test", () => {
    const none = profile({ testScores: [{ id: "g", exam: "gre", version: null, total: 320, sections: null, takenOn: null }] });
    expect(resolve("tests--taken", "tests.english.taken", none)).toEqual({ status: "needs_student", reason: "no_value" });
  });

  it("asks when the student's test isn't one the portal lists", () => {
    const ukvi = profile({ testScores: [{ id: "u", exam: "ielts_ukvi", version: null, total: 7, sections: null, takenOn: null }] });
    expect(resolve("tests--taken", "tests.english.exam", ukvi)).toEqual({ status: "needs_student", reason: "format_differs" });
  });

  it("fills activity entries in order, or in the order the student picked", () => {
    expect(resolve("activities--two", "activities[].role", profile(), 2)).toMatchObject({ value: "Library volunteer", source: "activities[1].title" });
    const picked = resolveValue(field("activities--two", "activities[].role", 1), profile(), practice, { activityOrder: ["a-2", "a-1"] });
    expect(picked).toMatchObject({ value: "Library volunteer" });
    expect(resolve("activities--two", "activities[].organisation", profile(), 2)).toEqual({ status: "needs_student", reason: "no_value" });
  });
});

describe("what the extension leaves alone", () => {
  it("leaves names, date of birth and phone for the student (R15)", () => {
    for (const role of ["person.given_names", "person.family_name", "person.date_of_birth", "contact.phone"]) {
      expect(resolve("about-you", role)).toEqual({ status: "needs_student", reason: "student" });
    }
  });

  it("pauses on the security check and never touches fee or declaration", () => {
    expect(resolve("security-check", "security.challenge")).toEqual({ status: "pause", reason: "captcha" });
    expect(resolve("fee--waiver", "fee.waiver")).toEqual({ status: "never", reason: "fee_waiver" });
    expect(resolve("declaration", "declaration.confirm")).toEqual({ status: "never", reason: "declaration" });
    expect(resolve("declaration", "declaration.signature")).toEqual({ status: "never", reason: "declaration" });
  });

  it("leaves an unmatched field unmatched", () => {
    const doc = fixture("about-you");
    doc.querySelector("form[data-page]")!.insertAdjacentHTML("beforeend", `<label for="q">Favourite colour</label><input id="q">`);
    const m = matchPage(doc, practice).find((x) => x.key === "q")!;
    expect(resolveValue(m, profile(), practice)).toEqual({ status: "needs_student", reason: "no_match" });
  });
});

describe("the personal statement: the student's own final draft only", () => {
  const draft = { documentId: "d-1", kind: "personal_statement", title: "PS", question: null, versionId: "v-3", wordCount: 600 };

  it("offers no paste and lists the field when there's no final draft", () => {
    expect(resolve("statement", "essay.personal_statement")).toEqual({ status: "needs_student", reason: "no_value" });
  });

  it("offers copy only when the course's AI policy is unknown or bans it", () => {
    for (const aiPolicy of ["unknown", "bans", "limited"] as const) {
      expect(resolve("statement", "essay.personal_statement", profile({ aiPolicy, finalDrafts: [draft] }))).toEqual({
        status: "draft",
        paste: false,
        choices: [{ documentId: "d-1", versionId: "v-3", wordCount: 600, fits: true }],
        source: "finalDraft",
      });
    }
  });

  it("offers paste only when the verified policy allows it", () => {
    expect(resolve("statement", "essay.personal_statement", profile({ aiPolicy: "allows", finalDrafts: [draft] }))).toMatchObject({ status: "draft", paste: true });
  });

  it("marks a draft over the word limit as not fitting, and never trims it", () => {
    const long = { ...draft, wordCount: 700 };
    expect(resolve("statement", "essay.personal_statement", profile({ aiPolicy: "allows", finalDrafts: [long] }))).toMatchObject({
      choices: [{ documentId: "d-1", fits: false }],
    });
  });

  it("offers only drafts of a fitting kind", () => {
    const why = { ...draft, documentId: "d-2", kind: "why_this_university" };
    expect(resolve("statement", "essay.personal_statement", profile({ finalDrafts: [why] }))).toEqual({ status: "needs_student", reason: "no_value" });
  });
});
