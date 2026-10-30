import { describe, expect, it } from "vitest";
import { CATALOGUE, computeJourney, evaluateCatalogue, resolveHref, upcomingDeadlines } from "../src";
import type { CountryRuleRow, JourneyInput } from "../src";
import { STAGE_FIXTURES, TODAY, application, base, programs, readyProfile } from "./fixtures";

// Engine additions for the M2 shell (J2.1): sources, markable, hidden and marked steps,
// upcoming deadlines, and consent handling.

const preparingWithDeadline = (status: "verified" | "unverified", sourceUrl: string | null) =>
  base({
    profile: readyProfile,
    applications: [
      application("a1", programs.exampleton!, {
        status: "preparing",
        deadlines: [{ id: "d1", dueAt: "2026-11-10T23:59:00Z", timezone: "Europe/London", precision: "date", status, sourceUrl }],
      }),
    ],
  });

describe("fact sources", () => {
  it("links a step that quotes a fact to the fact's official page", () => {
    const steps = computeJourney(preparingWithDeadline("verified", "https://exampleton.ac.uk/apply")).steps;
    const fee = steps.find((s) => s.catalogueId === "S4.14")!;
    expect(fee.factRefs).toEqual([{ table: "deadlines", id: "d1", status: "verified" }]);
    expect(fee.source).toEqual({ href: "https://exampleton.ac.uk/apply" });
  });

  it("falls back to the course page, or /visas for a country rule", () => {
    const steps = computeJourney(preparingWithDeadline("unverified", null)).steps;
    const fee = steps.find((s) => s.catalogueId === "S4.14")!;
    expect(fee.source).toEqual({ href: `/courses/${programs.exampleton!.slug}` });
    expect(resolveHref(fee.source!.href)).toBe("/courses/[slug]");
    const rule: CountryRuleRow = { id: "r1", destination: "DE", kind: "aps_certificate", title: "APS certificate", link: null, status: "verified", appliesTo: ["IN"] };
    const withRule = base({ profile: readyProfile, countryRules: [rule], applications: [application("a2", programs.tum!, { status: "preparing" })] });
    expect(computeJourney(withRule).steps.find((s) => s.catalogueId === "S4.02")!.source).toEqual({ href: "/visas" });
    const linked = base({ ...withRule, countryRules: [{ ...rule, sourceUrl: "https://aps-india.de" }] });
    expect(computeJourney(linked).steps.find((s) => s.catalogueId === "S4.02")!.source).toEqual({ href: "https://aps-india.de" });
  });

  it("gives a source exactly when a step quotes a fact", () => {
    for (const f of Object.values(STAGE_FIXTURES))
      for (const s of computeJourney(f.input).steps) expect(Boolean(s.source), s.id).toBe(s.factRefs.length > 0);
  });
});

describe("markable, hidden and marked", () => {
  it("copies markable from the catalogue", () => {
    const markable = new Set(CATALOGUE.filter((d) => d.markable).map((d) => d.id));
    for (const f of Object.values(STAGE_FIXTURES))
      for (const s of computeJourney(f.input).steps) expect(s.markable, s.id).toBe(markable.has(s.catalogueId));
  });

  it("lists dismissed and snoozed steps with their titles, and drops a snooze once it ends", () => {
    const input: JourneyInput = {
      ...STAGE_FIXTURES["stage-2-exploring"]!.input,
      stepState: [
        { stepId: "S2.01", state: "dismissed", until: null },
        { stepId: "S2.03", state: "snoozed", until: "2026-11-09T00:00:00Z" },
      ],
    };
    const r = computeJourney(input);
    expect(r.hidden).toEqual([
      { id: "S2.01", catalogueId: "S2.01", title: "Look through your matches", state: "dismissed", until: null },
      { id: "S2.03", catalogueId: "S2.03", title: "Compare your countries", state: "snoozed", until: "2026-11-09T00:00:00Z" },
    ]);
    expect(r.steps.map((s) => s.id)).not.toContain("S2.01");
    const later = computeJourney({ ...input, today: "2026-11-09" });
    expect(later.hidden.map((h) => h.id)).toEqual(["S2.01"]);
    expect(later.steps.map((s) => s.id)).toContain("S2.03");
  });

  it("reports steps done only because the student marked them", () => {
    const input = { ...STAGE_FIXTURES["stage-2-exploring"]!.input, stepState: [{ stepId: "S2.03", state: "done" as const, until: null }] };
    const r = computeJourney(input);
    expect(r.marked).toEqual(["S2.03"]);
    expect(r.completed).toContain("S2.03");
    expect(computeJourney(STAGE_FIXTURES["stage-2-exploring"]!.input).marked).toEqual([]);
  });
});

describe("upcoming deadlines", () => {
  it("lists the next known deadlines of active applications, soonest first", () => {
    const d = (id: string, dueAt: string, status: "verified" | "unverified" | "unknown") => ({ id, dueAt, timezone: "UTC", precision: "date", status });
    const input = base({
      profile: readyProfile,
      applications: [
        application("a1", programs.exampleton!, { status: "preparing", deadlines: [d("past", "2026-10-01T00:00:00Z", "verified"), d("late", "2027-03-01T00:00:00Z", "verified")] }),
        application("a2", programs.tum!, { status: "preparing", deadlines: [d("soon", "2026-11-20T00:00:00Z", "unverified"), d("unknown", "2026-11-05T00:00:00Z", "unknown")] }),
        application("a3", programs.state!, { status: "withdrawn", deadlines: [d("gone", "2026-11-04T00:00:00Z", "verified")] }),
      ],
    });
    const up = upcomingDeadlines(input, 3);
    expect(up.map((u) => u.factRef.id)).toEqual(["soon", "late"]);
    expect(up[0]).toMatchObject({ applicationId: "a2", status: "unverified", label: "M.Sc. Informatik, Technische Universität Beispielstadt", sourceUrl: null });
    expect(upcomingDeadlines(input, 1)).toHaveLength(1);
    // Once an application is sent, its deadlines drop out of "Coming up".
    const sent = { ...input, applications: input.applications.map((a) => (a.id === "a2" ? { ...a, status: "submitted" as const } : a)) };
    expect(upcomingDeadlines(sent, 3).map((u) => u.factRef.id)).toEqual(["late"]);
    expect(TODAY).toBe("2026-11-02");
  });
});

describe("copy", () => {
  it("says item or items to match the count", () => {
    const item = (done: boolean) => ({ id: `c${done}`, title: "x", done, dueAt: null, kind: "requirement", link: null, countryRuleId: null });
    const reason = (checklist: ReturnType<typeof item>[]) =>
      computeJourney(base({ profile: readyProfile, applications: [application("a1", programs.exampleton!, { status: "preparing", checklist })] }))
        .steps.find((s) => s.catalogueId === "S4.01")!.reason;
    expect(reason([item(false)])).toBe("MSc Data Science, University of Exampleton has 1 checklist item still open.");
    expect(reason([item(false), { ...item(false), id: "c2" }])).toContain("has 2 checklist items still open.");
  });
});

describe("consent", () => {
  it("shows only S1.06 under pending consent, even with a full profile and an application", () => {
    const r = computeJourney(STAGE_FIXTURES["edge-pending-consent-with-application"]!.input);
    expect(r.stage).toBe(4);
    expect(r.steps.map((s) => s.id)).toEqual(["S1.06"]);
  });

  it("gives no steps, and no S1.06, when consent was revoked", () => {
    const input = STAGE_FIXTURES["edge-revoked-consent"]!.input;
    const r = computeJourney(input);
    expect(r.steps).toEqual([]);
    expect(r.completed).not.toContain("S1.06");
    expect(evaluateCatalogue(input).open).toEqual([]);
  });

  it("counts S1.06 as done once consent is granted", () => {
    expect(computeJourney(base({ profile: { ...readyProfile, consentState: "granted" } })).completed).toContain("S1.06");
  });
});
