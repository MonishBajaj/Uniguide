import { describe, expect, it } from "vitest";
import type { AccountState } from "../src/messages";
import { applyFill, asking, buildRows, canFill, canSuggest, confirmSuggestion, copied, gotSuggestion, initial, logFor, phaseOf, rejectSuggestion, skipped, sourceKey, type PanelState } from "../src/panel/state";
import { profile, scanOf } from "./helpers";

const account = (over: Partial<AccountState> = {}): AccountState => ({
  signedIn: true,
  email: "applicant@uniguide.local",
  consent: "not_required",
  applications: [{ id: "app-1", title: "MSc Data Science", institution: "Exampleton", status: "preparing" }],
  ...over,
});

const ready = (scanName: string, p = profile()): PanelState => {
  const scan = scanOf(scanName);
  return { ...initial(), account: account(), applicationId: "app-1", profile: p, scan, rows: buildRows(scan, p) };
};

describe("what the panel shows", () => {
  it("asks to connect when signed out", () => {
    expect(phaseOf({ ...initial(), account: account({ signedIn: false, email: null }) })).toBe("signed_out");
  });

  it("shows only the reason while consent is pending or revoked, with nothing to fill", () => {
    for (const consent of ["pending_parental", "revoked"] as const) {
      const s = { ...initial(), account: account({ consent, applications: [] }) };
      expect(phaseOf(s)).toBe("consent");
      expect(s.rows).toEqual([]);
    }
  });

  it("asks which application this is before anything else", () => {
    expect(phaseOf({ ...initial(), account: account() })).toBe("choose");
  });

  it("says when the page isn't one we support", () => {
    expect(phaseOf({ ...initial(), account: account(), applicationId: "app-1", profile: profile(), scan: null })).toBe("unsupported");
  });

  it("is ready once there's an application, a profile and a supported page", () => {
    expect(phaseOf(ready("about-you"))).toBe("ready");
  });
});

describe("rows", () => {
  it("offers facts with their value exactly as stored and where it came from, in page order", () => {
    const rows = ready("about-you").rows.filter((r) => r.group === "fill");
    expect(rows.map((r) => [r.role, r.value, r.source])).toEqual([
      ["contact.email", "applicant@uniguide.local", "contact.email"],
      ["contact.residence_country", "IN", "contact.residenceCountry"],
    ]);
    expect(rows[1]!.shown).toBe("India");
  });

  it("lists the fields left for the student separately, with the reason", () => {
    const rows = ready("about-you").rows.filter((r) => r.group === "review");
    expect(rows.map((r) => [r.role, r.reason])).toEqual([
      ["person.given_names", "student"],
      ["person.family_name", "student"],
      ["person.date_of_birth", "student"],
      ["contact.phone", "student"],
    ]);
    expect(rows.every((r) => r.value === undefined)).toBe(true);
  });

  it("offers nothing to fill for a choice the portal doesn't have", () => {
    const uk = profile({ education: { qualification: "bachelor_3yr", grade: { value: null, text: "2:1", scale: "uk_class" }, priorCredits: { value: null, system: null } } });
    const scale = ready("schooling", uk).rows.find((r) => r.role === "education.grade.scale")!;
    expect(scale).toMatchObject({ group: "review", reason: "format_differs" });
    expect(scale.value).toBeUndefined();
  });

  it("shows the grade as entered, with the option the portal calls the same scale", () => {
    const rows = ready("schooling").rows;
    expect(rows.find((r) => r.role === "education.grade.value")).toMatchObject({ value: "8.4", source: "education.grade.value" });
    expect(rows.find((r) => r.role === "education.grade.scale")).toMatchObject({ value: "gpa_10", shown: "GPA out of 10" });
  });

  it("puts essays apart, with paste only where the verified policy allows it", () => {
    const draft = { documentId: "d-1", kind: "personal_statement", title: "PS", question: null, versionId: "v-1", wordCount: 500 };
    const unknown = ready("statement", profile({ finalDrafts: [draft] })).rows[0]!;
    expect(unknown).toMatchObject({ group: "essay", draft: { paste: false } });
    const allows = ready("statement", profile({ aiPolicy: "allows", finalDrafts: [draft] })).rows[0]!;
    expect(allows).toMatchObject({ group: "essay", draft: { paste: true } });
  });

  it("lists sign, pay and security steps as the student's own, with no actions", () => {
    const rows = ready("declaration").rows;
    expect(rows.map((r) => [r.role, r.group])).toEqual([
      ["declaration.confirm", "yours"],
      ["declaration.signature", "yours"],
    ]);
    expect(ready("security-check").rows[0]).toMatchObject({ group: "yours", reason: "captcha" });
  });
});

describe("actions", () => {
  it("asks before replacing what's in a field, and fills once confirmed", () => {
    let s = ready("about-you");
    s = applyFill(s, "field-email", undefined, { status: "confirm_overwrite", current: "old@example.com" });
    expect(s.prompt).toEqual({ key: "field-email", current: "old@example.com", value: "applicant@uniguide.local" });
    s = applyFill(s, "field-email", undefined, { status: "filled" });
    expect(s.prompt).toBeUndefined();
    expect(s.rows.find((r) => r.key === "field-email")!.status).toBe("filled");
  });

  it("says so when a choice field has no matching option, and leaves it", () => {
    const s = applyFill(ready("schooling"), "field-grade_scale", undefined, { status: "no_option" });
    expect(s.rows.find((r) => r.key === "field-grade_scale")!.status).toBe("no_option");
    expect(s.notice).toEqual({ key: "field-grade_scale", text: "noOption" });
  });

  it("marks blocked, copied and skipped fields", () => {
    let s = applyFill(ready("about-you"), "field-email", undefined, { status: "blocked", why: "hidden", logReason: "guard" });
    expect(s.rows.find((r) => r.key === "field-email")!.status).toBe("blocked");
    s = copied(s, "field-country_of_residence");
    s = skipped(s, "field-phone");
    expect(s.rows.find((r) => r.key === "field-country_of_residence")!.status).toBe("copied");
    expect(s.rows.find((r) => r.key === "field-phone")!.status).toBe("skipped");
  });
});

describe("the audit log", () => {
  it("records the role, page and source, never the value", () => {
    const s = ready("about-you");
    const row = s.rows.find((r) => r.key === "field-email")!;
    const msg = logFor(s, row, "filled");
    expect(msg).toEqual({ to: "background", type: "log", kind: "filled", role: "contact.email", page: "about-you", source: "contact.email", reason: null });
    expect(JSON.stringify(msg)).not.toContain("applicant@uniguide.local");
  });

  it("gives a reason for skips and blocks", () => {
    const s = ready("about-you");
    const phone = s.rows.find((r) => r.key === "field-phone")!;
    expect(logFor(s, phone, "skipped")).toMatchObject({ kind: "skipped", reason: "student", source: null });
    expect(logFor(s, phone, "blocked", "guard")).toMatchObject({ kind: "blocked", reason: "guard" });
  });

  it("logs repeated fields by their role, which the log accepts", () => {
    const s = ready("activities--two", profile({ activities: [{ id: "a", section: "projects", title: "Robotics", organisation: null, location: null, start: null, end: null, bullets: [] }] }));
    const row = s.rows.find((r) => r.key === "field-activity_1_role")!;
    expect(logFor(s, row, "filled")).toMatchObject({ role: "activities[].role", source: "activities[0].title" });
  });
});

describe("source wording", () => {
  it("names every source in plain words", () => {
    expect(sourceKey("contact.email")).toBe("srcEmail");
    expect(sourceKey("education.grade.text")).toBe("srcGrade");
    expect(sourceKey("testScores[2].total")).toBe("srcTests");
    expect(sourceKey("activities[0].title")).toBe("srcCv");
    expect(sourceKey("finalDraft")).toBe("srcDraft");
  });
});

describe("suggested roles for unmatched fields (A1.6)", () => {
  // A field the practice map doesn't know, labelled the way another portal might.
  const withUnknown = (): PanelState => {
    const s = ready("about-you");
    const field = { key: "field-contact_email", name: "contact_email", control: "email", label: "Where can we reach you?", role: null, confidence: 0, via: "none" as const, action: "student" as const, required: true, visible: true, hasValue: false };
    const scan = { ...s.scan!, fields: [...s.scan!.fields, field] };
    return { ...s, scan, rows: buildRows(scan, s.profile) };
  };
  const row = (s: PanelState) => s.rows.find((r) => r.key === "field-contact_email")!;

  it("offers a suggestion only for a field with no match", () => {
    const s = withUnknown();
    expect(row(s)).toMatchObject({ group: "review", reason: "no_match" });
    expect(canSuggest(row(s))).toBe(true);
    expect(canSuggest(s.rows.find((r) => r.key === "field-email")!)).toBe(false);
  });

  it("never offers a fill on a suggestion until the student confirms it", () => {
    let s = gotSuggestion(asking(withUnknown(), "field-contact_email"), "field-contact_email", undefined, { outcome: "role", role: "contact.email" });
    expect(row(s)).toMatchObject({ group: "review", suggestion: { status: "suggested", role: "contact.email" } });
    expect(row(s).value).toBeUndefined();
    expect(canFill(row(s))).toBe(false);

    s = confirmSuggestion(s, "field-contact_email");
    expect(row(s)).toMatchObject({ group: "fill", via: "suggested", confirmedRole: "contact.email", value: "applicant@uniguide.local" });
    expect(canFill(row(s))).toBe(true);
  });

  it("drops a suggestion the student says is wrong", () => {
    let s = gotSuggestion(withUnknown(), "field-contact_email", undefined, { outcome: "role", role: "contact.email" });
    s = rejectSuggestion(s, "field-contact_email");
    expect(row(s)).toMatchObject({ group: "review", reason: "no_match", suggestion: { status: "rejected" } });
    expect(canFill(row(s))).toBe(false);
  });

  it("keeps a confirmed sign, pay or security role off limits", () => {
    let s = gotSuggestion(withUnknown(), "field-contact_email", undefined, { outcome: "role", role: "declaration.signature" });
    s = confirmSuggestion(s, "field-contact_email");
    expect(row(s)).toMatchObject({ group: "yours" });
    expect(canFill(row(s))).toBe(false);
  });

  it("says so when there's no suggestion, or the limit is reached", () => {
    let s = gotSuggestion(withUnknown(), "field-contact_email", undefined, { outcome: "none" });
    expect(row(s).suggestion).toEqual({ status: "none" });
    s = gotSuggestion(s, "field-contact_email", undefined, { outcome: "limit" });
    expect(row(s).suggestion).toEqual({ status: "limit" });
  });

  it("never takes essay text from a suggestion: a field confirmed as an essay offers only the student's own final draft", () => {
    const draft = { documentId: "d-1", kind: "personal_statement", title: "PS", question: null, versionId: "v-1", wordCount: 400 };
    let s = withUnknown();
    s = { ...s, profile: profile({ aiPolicy: "allows", finalDrafts: [draft] }) };
    s = gotSuggestion(s, "field-contact_email", undefined, { outcome: "role", role: "essay.personal_statement" });
    s = confirmSuggestion(s, "field-contact_email");
    expect(row(s)).toMatchObject({ group: "essay", draft: { paste: true, choices: [{ documentId: "d-1" }] } });
    expect(row(s).value).toBeUndefined();
  });

  it("logs a fill of a confirmed suggestion by its role, like any other", () => {
    let s = gotSuggestion(withUnknown(), "field-contact_email", undefined, { outcome: "role", role: "contact.email" });
    s = confirmSuggestion(s, "field-contact_email");
    expect(logFor(s, row(s), "filled")).toMatchObject({ role: "contact.email", source: "contact.email" });
  });
});
