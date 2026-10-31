import { describe, expect, it } from "vitest";
import { practice } from "@uniguide/portal-adapters/practice";
import { fill } from "../src/writer";
import { fixture } from "./helpers";

const value = (doc: Document, id: string) => (doc.getElementById(id) as HTMLInputElement).value;

describe("the single writer", () => {
  it("fills one text field, telling the page as typing would", () => {
    const doc = fixture("about-you");
    const seen: string[] = [];
    doc.getElementById("field-email")!.addEventListener("input", () => seen.push("input"));
    doc.getElementById("field-email")!.addEventListener("change", () => seen.push("change"));
    expect(fill(doc, practice, { key: "field-email", value: "a@b.c", overwrite: false })).toEqual({ status: "filled" });
    expect(value(doc, "field-email")).toBe("a@b.c");
    expect(seen).toEqual(["input", "change"]);
    expect(value(doc, "field-given_names")).toBe(""); // nothing else touched
  });

  it("asks before replacing text, and replaces it only when told to", () => {
    const doc = fixture("about-you");
    (doc.getElementById("field-email") as HTMLInputElement).value = "mine@example.com";
    expect(fill(doc, practice, { key: "field-email", value: "a@b.c", overwrite: false })).toEqual({ status: "confirm_overwrite", current: "mine@example.com" });
    expect(value(doc, "field-email")).toBe("mine@example.com");
    expect(fill(doc, practice, { key: "field-email", value: "a@b.c", overwrite: true })).toEqual({ status: "filled" });
    expect(value(doc, "field-email")).toBe("a@b.c");
  });

  it("selects only an exactly matching option, and otherwise does nothing", () => {
    const doc = fixture("schooling");
    expect(fill(doc, practice, { key: "field-grade_scale", value: "uk_class", overwrite: true })).toEqual({ status: "no_option" });
    expect(value(doc, "field-grade_scale")).toBe("");
    expect(fill(doc, practice, { key: "field-grade_scale", value: "gpa_10", overwrite: false })).toEqual({ status: "filled" });
    expect(value(doc, "field-grade_scale")).toBe("gpa_10");
  });

  it("chooses a radio option only by exact value", () => {
    const doc = fixture("tests");
    expect(fill(doc, practice, { key: "english_test_taken", value: "maybe", overwrite: false })).toEqual({ status: "no_option" });
    expect(fill(doc, practice, { key: "english_test_taken", value: "yes", overwrite: false })).toEqual({ status: "filled" });
    expect((doc.getElementById("field-english_test_taken-yes") as HTMLInputElement).checked).toBe(true);
  });

  it("never truncates", () => {
    const doc = fixture("activities");
    const long = "x".repeat(301);
    expect(fill(doc, practice, { key: "field-activity_1_role", index: 1, value: long, overwrite: false })).toEqual({ status: "filled" });
    // The description has a 300-character limit, but it's the student's to write: the guard refuses first.
    expect(fill(doc, practice, { key: "field-activity_1_description", index: 1, value: long, overwrite: false })).toMatchObject({ status: "blocked" });
    const el = doc.getElementById("field-activity_1_role") as HTMLInputElement;
    el.maxLength = 10;
    expect(fill(doc, practice, { key: "field-activity_1_role", index: 1, value: "far too long a value", overwrite: true })).toEqual({ status: "too_long" });
  });

  it("refuses what the guard refuses: declarations, signatures, passwords, student-only fields", () => {
    const decl = fixture("declaration");
    expect(fill(decl, practice, { key: "field-declare", value: "on", overwrite: false })).toMatchObject({ status: "blocked" });
    expect(fill(decl, practice, { key: "field-signed_name", value: "Test", overwrite: false })).toMatchObject({ status: "blocked" });
    expect(value(decl, "field-signed_name")).toBe("");
    const signIn = fixture("sign-in");
    expect(fill(signIn, practice, { key: "password", value: "x", overwrite: false })).toMatchObject({ status: "blocked" });
    expect(fill(fixture("about-you"), practice, { key: "field-given_names", value: "Test", overwrite: false })).toMatchObject({ status: "blocked" });
  });

  it("refuses a hidden conditional field", () => {
    const doc = fixture("schooling");
    expect(fill(doc, practice, { key: "field-expected_completion", value: "2027-05", overwrite: false })).toEqual({ status: "not_found" });
  });
});

describe("a field the student matched by confirming a suggestion (A1.6)", () => {
  const withUnknown = () => {
    const doc = fixture("about-you");
    doc.querySelector("form[data-page]")!.insertAdjacentHTML("beforeend", `<label for="reach">Where can we reach you?</label><input id="reach" name="reach" type="email">`);
    return doc;
  };

  it("isn't filled without the confirmed role", () => {
    const doc = withUnknown();
    expect(fill(doc, practice, { key: "reach", value: "a@b.c", overwrite: false })).toMatchObject({ status: "blocked" });
    expect(value(doc, "reach")).toBe("");
  });

  it("is filled with it", () => {
    const doc = withUnknown();
    expect(fill(doc, practice, { key: "reach", value: "a@b.c", overwrite: false, confirmedRole: "contact.email" })).toEqual({ status: "filled" });
    expect(value(doc, "reach")).toBe("a@b.c");
  });

  it("never lets a confirmed role replace one the rules already found", () => {
    const doc = fixture("about-you");
    expect(fill(doc, practice, { key: "field-given_names", value: "x", overwrite: false, confirmedRole: "contact.email" })).toMatchObject({ status: "blocked" });
  });

  it("never fills a confirmed sign, pay or security role", () => {
    const doc = withUnknown();
    expect(fill(doc, practice, { key: "reach", value: "x", overwrite: false, confirmedRole: "declaration.signature" })).toMatchObject({ status: "blocked" });
  });
});
