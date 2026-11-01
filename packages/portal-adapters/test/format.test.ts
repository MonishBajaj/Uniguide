import { describe, expect, it } from "vitest";
import { ROLES, validateAdapter, type Adapter } from "../src/index";
import { practice } from "../src/practice/index";

const ROLE_RE = /^[a-z][a-z0-9_.[\]]{0,79}$/; // assist_events.field_role
const VERSION_RE = /^[a-z0-9_.-]{1,40}$/; // assist_runs.adapter_version
const PORTAL_RE = /^[a-z_]{1,40}$/; // assist_runs.portal

describe("canonical roles", () => {
  it("fit the audit log's role column", () => {
    for (const role of Object.keys(ROLES)) expect(role).toMatch(ROLE_RE);
  });

  it("make anything that signs, pays or declares a never role", () => {
    expect(ROLES["declaration.confirm"].action).toBe("never");
    expect(ROLES["declaration.signature"].action).toBe("never");
    expect(ROLES["fee.waiver"].action).toBe("never");
    expect(ROLES["security.challenge"].action).toBe("pause");
  });
});

describe("adapter format", () => {
  it("accepts the practice adapter, whose names fit the audit log", () => {
    expect(validateAdapter(practice)).toEqual([]);
    expect(practice.version).toMatch(VERSION_RE);
    expect(practice.portal).toMatch(PORTAL_RE);
  });

  const broken = (change: (a: Adapter) => void): Adapter => {
    const a = structuredClone(practice);
    change(a);
    return a;
  };

  it("rejects an unknown role", () => {
    expect(validateAdapter(broken((a) => (a.map.pages[0]!.fields[0]!.role = "person.shoe_size")))).toContain(
      "about-you: unknown role person.shoe_size",
    );
  });

  it("rejects a field that's found twice", () => {
    expect(validateAdapter(broken((a) => (a.map.pages[1]!.fields[0]!.find = { id: "field-email", name: "email" })))).toContain(
      "field-email is mapped twice",
    );
  });

  it("rejects a control that's both allowed and never-click", () => {
    expect(validateAdapter(broken((a) => a.map.allowedClicks.push({ id: "submit-application", what: "x" })))).toContain(
      "submit-application is both allowed and never-click",
    );
  });

  it("rejects a mapped field that weakens a never role", () => {
    expect(validateAdapter(broken((a) => (a.map.pages[7]!.fields[0]!.action = "fill")))).toContain(
      "declaration: declaration.confirm must be never, not fill",
    );
  });

  it("rejects an option equivalent that points at no option", () => {
    expect(validateAdapter(broken((a) => (a.optionEquivalents["education.qualification"]!["cbse"] = "cbse_10")))).toContain(
      "education.qualification: cbse maps to cbse_10, which isn't an option",
    );
  });
});
