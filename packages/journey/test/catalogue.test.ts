import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE, COPY, REASON_MAX, ROUTES, TITLE_MAX, buildCtx, computeJourney, evaluateCatalogue, fit, render, resolveHref } from "../src";
import type { CountryRuleRow, JourneyInput } from "../src";
import { STAGE_FIXTURES, application, base, programs, readyProfile } from "./fixtures";

const ids = (input: JourneyInput) => evaluateCatalogue(input).open.map((s) => s.catalogueId);

/** M1 plan "Deviations". S1.03 turned on in M2 with the profile's intake field. Changing this list is a deliberate act. */
const UNAVAILABLE = [
  "S2.07", "S3.04", "S3.06",
  "S5.02", "S5.03", "S5.04", "S7.03", "S7.04", "S7.08",
];

const LONG = "A".repeat(120);

/** One input that makes every available step open at least once, with a 120-character course name. */
function everything(): JourneyInput {
  const long = { ...programs.tum!, title: LONG, institution: "Technische Universität Beispielstadt", level: "doctorate" as const };
  const rules: CountryRuleRow[] = [
    { id: "r-aps", destination: "DE", kind: "aps_certificate", title: "APS certificate", link: "https://aps-india.de", status: "verified", appliesTo: ["IN"] },
    { id: "r-eval", destination: "DE", kind: "credential_evaluation", title: "Credential evaluation", link: null, status: "unverified", appliesTo: [] },
    { id: "r-funds", destination: "DE", kind: "proof_of_funds", title: "Blocked account", link: null, status: "verified", appliesTo: [] },
    { id: "r-cred", destination: "DE", kind: "credential_evaluation", title: "Anabin check", link: null, status: "verified", appliesTo: [] },
    { id: "r-bank", destination: "DE", kind: "banking", title: "Bank account", link: null, status: "verified", appliesTo: [] },
  ];
  const req = (id: string, kind: never | string, extra = {}) => ({ id, kind, exam: null, testPolicy: null, countRequired: null, status: "verified", ...extra }) as never;
  return base({
    today: "2027-08-25",
    profile: { ...readyProfile, gradeValue: null, gradeScale: null, budgetAmount: null, targetLevels: ["bachelor", "master", "doctorate"] },
    matchRuns: { latestAt: "2027-01-01T00:00:00Z", feasibleCount: 2 },
    testScores: [{ id: "t1", exam: "ielts_academic", examVersion: null, total: 7, takenOn: null }],
    countryRules: rules,
    applications: [
      application("prep", long, {
        status: "preparing",
        deadlines: [{ id: "d-prep", dueAt: "2027-09-01T23:59:00Z", timezone: "Europe/Berlin", precision: "date", status: "verified" }],
        checklist: [{ id: "c1", title: "Transcript", done: false, dueAt: null, kind: "requirement", link: null, countryRuleId: null }],
        requirements: [
          req("q-letters", "recommendation_letters", { countRequired: 2 }),
          req("q-statement", "statement"),
          req("q-portfolio", "portfolio"),
          req("q-ielts", "language_test", { exam: "ielts_academic" }),
        ],
        letters: [
          { id: "l1", recommenderId: "rec1", recommenderName: LONG, status: "not_asked", dueOn: null },
          { id: "l2", recommenderId: "rec2", recommenderName: LONG, status: "agreed", dueOn: null },
        ],
        documents: [
          { id: "doc1", kind: "supplemental", question: "Why us?", versions: 0, reviews: 0 },
          { id: "doc2", kind: "why_this_university", question: null, versions: 2, reviews: 0 },
        ],
      }),
      application("ready", { ...long, id: "p2" }, {
        status: "preparing",
        checklist: [{ id: "c2", title: "Fee", done: true, dueAt: null, kind: "requirement", link: null, countryRuleId: null }],
      }),
      application("short", { ...long, id: "p3" }, {
        deadlines: [{ id: "d-short", dueAt: "2027-09-10T23:59:00Z", timezone: "Europe/Berlin", precision: "date", status: "verified" }],
      }),
      application("sent", { ...long, id: "p4" }, { status: "submitted" }),
      application("wait", { ...long, id: "p5" }, { status: "decided", decision: "waitlisted" }),
      application("offer1", { ...long, id: "p6" }, { status: "decided", decision: "admitted", depositDueAt: "2027-09-01T00:00:00Z" }),
      application("offer2", { ...long, id: "p7" }, { status: "decided", decision: "admitted" }),
      application("going", { ...long, id: "p8" }, {
        status: "decided",
        decision: "admitted",
        offerAcceptedAt: "2027-06-01T00:00:00Z",
        cycle: { id: "c-going", label: "2027-winter", startsOn: "2027-09-20" },
        conditions: { metAt: null },
        depositDueAt: "2027-09-05T00:00:00Z",
      }),
      application("going2", { ...long, id: "p9" }, {
        status: "decided",
        decision: "admitted",
        offerAcceptedAt: "2027-06-01T00:00:00Z",
        admissionDocumentAt: "2027-07-01T00:00:00Z",
      }),
    ],
  });
}

/** Stage 3: one shortlisted course with a verified TOEFL minimum above the student's best, and a budget. */
function shortlistStage(overrides: { status?: "verified" | "unverified"; scores?: JourneyInput["testScores"]; shortlisted?: number } = {}): JourneyInput {
  const long = { ...programs.exampleton!, title: LONG };
  const toefl = {
    id: "q-toefl", kind: "language_test" as const, exam: "toefl_ibt", examVersion: "legacy", minTotal: 100,
    testPolicy: null, countRequired: null, status: overrides.status ?? ("verified" as const),
  };
  return base({
    profile: readyProfile,
    testScores: overrides.scores ?? [{ id: "t1", exam: "toefl_ibt", examVersion: "legacy", total: 92, takenOn: null }],
    shortlist: Array.from({ length: overrides.shortlisted ?? 1 }, (_, n) => ({ program: { ...long, id: `p${n}` }, createdAt: "2026-10-01T00:00:00Z" })),
    applications: [application("short", long, { requirements: [toefl] })],
  });
}

/** Inputs that between them open every available step at least once, all with long names. */
function scenarios(): JourneyInput[] {
  const long = { ...programs.exampleton!, title: LONG };
  const testReq = { id: "q-ielts", kind: "language_test" as const, exam: "ielts_academic", testPolicy: null, countRequired: null, status: "verified" as const };
  return [
    everything(),
    base(),
    STAGE_FIXTURES["edge-pending-consent"]!.input,
    STAGE_FIXTURES["edge-rejected-everywhere"]!.input,
    STAGE_FIXTURES["stage-2-exploring"]!.input,
    STAGE_FIXTURES["stage-4-preparing"]!.input,
    base({ profile: { ...readyProfile, gradeValue: null } }),
    base({ profile: readyProfile, matchRuns: { latestAt: "2026-10-20T10:00:00Z", feasibleCount: 3 } }),
    base({
      profile: readyProfile,
      applications: [
        application("near", long, {
          requirements: [testReq],
          deadlines: [{ id: "d1", dueAt: "2026-12-01T23:59:00Z", timezone: "Europe/London", precision: "date", status: "verified" }],
        }),
      ],
    }),
    shortlistStage(),
    base({ profile: readyProfile, applications: [application("prep", long, { status: "preparing", requirements: [testReq] })] }),
    base({
      profile: readyProfile,
      applications: [
        application("o1", long, { status: "decided", decision: "admitted", depositDueAt: "2026-11-10T00:00:00Z" }),
        application("o2", { ...long, id: "p2" }, { status: "decided", decision: "admitted" }),
      ],
    }),
  ];
}

describe("catalogue shape", () => {
  it("has unique ids S1.01 to S7.08 in order", () => {
    const all = CATALOGUE.map((d) => d.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^S[1-7]\.\d{2}(-check)?$/);
    expect(all[0]).toBe("S1.01");
    expect(all.at(-1)).toBe("S7.08");
    expect(all.filter((id) => !id.endsWith("-check"))).toHaveLength(60);
    for (const d of CATALOGUE) expect(d.id.startsWith(`S${d.stage}.`)).toBe(true);
  });

  it("has English copy for every step and every copy key it uses", () => {
    for (const d of CATALOGUE) expect(COPY.en[d.id], d.id).toBeDefined();
    const used = new Set(scenarios().flatMap((i) => evaluateCatalogue(i).open.map((s) => s.copy.key)));
    for (const key of used) expect(COPY.en[key], key).toBeDefined();
  });

  it("marks exactly the planned steps unavailable", () => {
    expect(CATALOGUE.filter((d) => !d.available).map((d) => d.id)).toEqual(UNAVAILABLE);
  });

  it("lets only S1.06, S3.05 and S6.04 refuse dismissal", () => {
    expect(CATALOGUE.filter((d) => !d.dismissable).map((d) => d.id)).toEqual(["S1.06", "S3.05", "S6.04"]);
  });

  it("never gives a parent title to writing, grade or score steps", () => {
    const privateSteps = ["S1.04", "S1.05", "S2.05", "S4.05", "S4.06", "S4.07", "S4.08", "S4.11", "S4.12"];
    for (const id of privateSteps) expect(CATALOGUE.find((d) => d.id === id)!.parentTitle, id).toBeUndefined();
  });

  it("uses lead times only on S4.03, S4.05 and S4.11", () => {
    expect(Object.fromEntries(CATALOGUE.filter((d) => d.leadDays).map((d) => [d.id, d.leadDays]))).toEqual({ "S4.03": 21, "S4.05": 21, "S4.11": 30 });
  });
});

describe("copy limits", () => {
  it("keeps every template within 60 and 160 characters with 120-character values", () => {
    for (const key of Object.keys(COPY.en)) {
      const { title, reason } = render(key, { course: LONG, recommender: LONG, rule: LONG, countries: LONG, destination: LONG, residence: LONG, date: "15 January 2027", count: "12", exam: "TOEFL iBT Home", document: "your draft" });
      expect(title.length, key).toBeLessThanOrEqual(TITLE_MAX);
      expect(reason.length, key).toBeLessThanOrEqual(REASON_MAX);
    }
  });

  it("keeps the full course name in application.label when the title is shortened", () => {
    const steps = scenarios().flatMap((i) => evaluateCatalogue(i).open);
    const s401 = steps.find((s) => s.catalogueId === "S4.01")!;
    expect(s401.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(s401.title).toContain("…");
    expect(s401.application!.label).toContain(LONG);
    for (const s of steps) {
      expect(s.title.length, s.id).toBeLessThanOrEqual(TITLE_MAX);
      expect(s.reason.length, s.id).toBeLessThanOrEqual(REASON_MAX);
      if (s.parentTitle) expect(s.parentTitle.length, s.id).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it("fit shortens with an ellipsis", () => {
    expect(fit("short", 10)).toBe("short");
    expect(fit("a long sentence here", 10)).toBe("a long se…");
    expect(fit("a long sentence here", 10)).toHaveLength(10);
  });
});

describe("links", () => {
  it("sends every available step to a known route and anchor", () => {
    const open = scenarios().flatMap((i) => evaluateCatalogue(i).open);
    const shown = new Set(open.map((s) => s.catalogueId));
    expect(CATALOGUE.filter((d) => d.available && !shown.has(d.id)).map((d) => d.id)).toEqual([]);
    for (const s of open) expect(resolveHref(s.href), `${s.id} → ${s.href}`).not.toBeNull();
    for (const f of Object.values(STAGE_FIXTURES))
      for (const s of evaluateCatalogue(f.input).open) expect(resolveHref(s.href), `${s.id} → ${s.href}`).not.toBeNull();
  });

  it("rejects unknown routes and anchors", () => {
    expect(resolveHref("/app/profile#nowhere")).toBeNull();
    expect(resolveHref("/app/profile#intake")).toBe("/app/profile");
    expect(resolveHref("/app/nowhere")).toBeNull();
    expect(resolveHref("/app/tracker/abc#portal")).toBe("/app/tracker/[id]");
    expect(resolveHref("/compare/countries?c=GB&c=DE")).toBe("/compare/countries");
  });

  it("lists only routes and anchors that exist in the web app", () => {
    const app = join(__dirname, "../../../apps/web/app");
    for (const route of Object.keys(ROUTES)) expect(existsSync(join(app, route, "page.tsx")), route).toBe(true);
    const sources = [join(__dirname, "../../../apps/web/app"), join(__dirname, "../../../apps/web/components")];
    const text: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".tsx")) text.push(readFileSync(p, "utf8"));
      }
    };
    sources.forEach(walk);
    const all = text.join("\n");
    for (const anchors of Object.values(ROUTES)) for (const a of anchors) expect(all, a).toContain(`id="${a}"`);
  });
});

describe("steps by situation", () => {
  it("S1.01 links to the short profile whatever the AI consent", () => {
    const step = (aiConsent: boolean) => evaluateCatalogue(base({ aiConsent })).open.find((s) => s.catalogueId === "S1.01")!;
    expect(step(true).href).toBe("/app/onboarding?screen=3");
    expect(step(false).href).toBe("/app/onboarding?screen=3");
  });

  it("asks a new student for the set-up steps, intake included", () => {
    expect(ids(base())).toEqual(["S1.01", "S1.02", "S1.03", "S1.04"]);
    expect(evaluateCatalogue(base()).open.find((s) => s.catalogueId === "S1.03")!.href).toBe("/app/profile#intake");
    expect(ids(base({ profile: { ...readyProfile, intakeYear: 2027 } }))).not.toContain("S1.03");
  });

  it("asks for parental consent while it is pending, and never lets it be dismissed", () => {
    const s = evaluateCatalogue(STAGE_FIXTURES["edge-pending-consent"]!.input).open.find((x) => x.catalogueId === "S1.06")!;
    expect(s.href).toBe("/consent");
    expect(s.dismissable).toBe(false);
    // Nothing else can be saved until a parent confirms, so nothing else is asked for.
    expect(ids(STAGE_FIXTURES["edge-pending-consent"]!.input)).toEqual(["S1.06"]);
    expect(evaluateCatalogue(base({ profile: { ...readyProfile, consentState: "granted" } })).completed).toContain("S1.06");
  });

  it("shows stage 2 steps from stage 2 only", () => {
    expect(ids(base()).some((id) => id.startsWith("S2."))).toBe(false);
    expect(ids(STAGE_FIXTURES["stage-2-exploring"]!.input)).toEqual(["S1.07", "S2.01", "S2.03", "S2.04"]);
  });

  it("drops exploration steps once the student is past them", () => {
    const late = ids(STAGE_FIXTURES["stage-7-accepted"]!.input);
    expect(late.filter((id) => id.startsWith("S2.") || id === "S4.10" || id.startsWith("S6.01"))).toEqual([]);
    expect(ids(STAGE_FIXTURES["stage-4-preparing"]!.input)).toContain("S2.04");
  });

  it("asks a doctorate student for research interests before matching", () => {
    const s = evaluateCatalogue(STAGE_FIXTURES["edge-doctorate-needs-research-interests"]!.input).open.find((x) => x.catalogueId === "S1.01")!;
    expect(s.href).toBe("/app/profile#research");
    expect(s.title).toBe("Tell us about your research interests");
  });

  it("S2.03 and S2.04 complete when the student marks them done", () => {
    const input = { ...STAGE_FIXTURES["stage-2-exploring"]!.input, stepState: [{ stepId: "S2.03", state: "done" as const, until: null }] };
    const r = evaluateCatalogue(input);
    expect(r.open.map((s) => s.catalogueId)).not.toContain("S2.03");
    expect(r.completed).toContain("S2.03");
  });

  it("gives S4.02 for a verified rule only; an unverified one asks the student to check", () => {
    const rule = (status: "verified" | "unverified"): CountryRuleRow => ({
      id: "r-aps", destination: "DE", kind: "aps_certificate", title: "APS certificate", link: "https://aps-india.de", status, appliesTo: ["IN"],
    });
    const input = (status: "verified" | "unverified") =>
      base({ profile: readyProfile, countryRules: [rule(status)], applications: [application("a1", programs.tum!, { status: "preparing" })] });

    const verified = evaluateCatalogue(input("verified")).open.filter((s) => s.catalogueId.startsWith("S4.02"));
    expect(verified.map((s) => s.catalogueId)).toEqual(["S4.02"]);
    expect(verified[0]!.factRefs).toEqual([{ table: "country_rules", id: "r-aps", status: "verified" }]);

    const unverified = evaluateCatalogue(input("unverified")).open.filter((s) => s.catalogueId.startsWith("S4.02"));
    expect(unverified.map((s) => s.catalogueId)).toEqual(["S4.02-check"]);
    expect(unverified[0]!.title).toBe("Check APS certificate with the university");
    expect(unverified[0]!.reason).not.toMatch(/you need|you meet|you don't meet/i);
    expect(unverified[0]!.factRefs).toEqual([{ table: "country_rules", id: "r-aps", status: "unverified" }]);
  });

  it("skips a rule for another residence and completes S4.02 from its checklist item", () => {
    const rule: CountryRuleRow = { id: "r-aps", destination: "DE", kind: "aps_certificate", title: "APS certificate", link: "https://aps-india.de", status: "verified", appliesTo: ["CN"] };
    const app = application("a1", programs.tum!, { status: "preparing" });
    expect(ids(base({ profile: readyProfile, countryRules: [rule], applications: [app] }))).not.toContain("S4.02");

    const mine = { ...rule, appliesTo: ["IN"] };
    const ticked = application("a1", programs.tum!, {
      status: "preparing",
      // Made before rule ids were stored: matched by link (plan D7).
      checklist: [{ id: "c1", title: "APS certificate", done: true, dueAt: null, kind: "system_step", link: "https://aps-india.de", countryRuleId: null }],
    });
    expect(evaluateCatalogue(base({ profile: readyProfile, countryRules: [mine], applications: [ticked] })).completed).toContain("S4.02:a1:r-aps");
  });

  it("gives the research statement step only to doctorate applicants", () => {
    const phd = { ...programs.tum!, level: "doctorate" as const };
    const research = base({ profile: { ...readyProfile, targetLevels: ["doctorate"], researchInterests: "Graph learning" }, applications: [application("a1", phd, { status: "preparing" })] });
    expect(ids(research)).toContain("S4.08");
    const masters = base({ profile: readyProfile, applications: [application("a1", programs.tum!, { status: "preparing" })] });
    expect(ids(masters)).not.toContain("S4.08");
  });

  it("carries the track label of an application on a track", () => {
    const input = base({
      profile: readyProfile,
      tracks: [{ id: "t1", name: "MBA", targetLevels: ["master"], targetCountries: ["US"], targetFields: ["0413"] }],
      applications: [application("a1", programs.state!, { status: "preparing", trackId: "t1" })],
    });
    const s = evaluateCatalogue(input).open.find((x) => x.catalogueId === "S4.14")!;
    expect(s.trackLabel).toBe("MBA");
    expect(s.application).toEqual({ id: "a1", label: "MS in Computer Science, Example State University" });
    expect(s.id).toBe("S4.14:a1");
  });

  it("shows portal checks for a submitted application while another is still being prepared", () => {
    const r = evaluateCatalogue(STAGE_FIXTURES["edge-split-submitted-preparing"]!.input);
    expect(r.open.map((s) => s.id)).toEqual(expect.arrayContaining(["S5.01:a1", "S4.14:a2"]));
  });

  it("offers the next-intake step when every decision is a rejection", () => {
    expect(ids(STAGE_FIXTURES["edge-rejected-everywhere"]!.input)).toEqual(expect.arrayContaining(["S5.06", "S6.09"]));
  });

  it("asks for a reply when the reply date is within 21 days, quoting the student's own date", () => {
    const s = evaluateCatalogue(STAGE_FIXTURES["stage-6-admitted"]!.input).open.find((x) => x.catalogueId === "S6.04")!;
    // The course name gives way so the date stays whole.
    expect(s.title).toBe("Reply to MSc Data Science, University o… by 20 November 2026");
    expect(s.reason).toContain("20 November 2026");
    expect(s.dismissable).toBe(false);
    expect(s.factRefs).toEqual([]);
  });

  it("quotes a deadline in S3.05 only when it is verified", () => {
    const near = (status: "verified" | "unverified") =>
      base({
        profile: readyProfile,
        applications: [application("a1", programs.exampleton!, { deadlines: [{ id: "d1", dueAt: "2026-12-01T23:59:00Z", timezone: "Europe/London", precision: "date", status }] })],
      });
    const v = evaluateCatalogue(near("verified")).open.find((s) => s.catalogueId === "S3.05")!;
    expect(v.reason).toContain("1 December 2026");
    expect(v.factRefs).toEqual([{ table: "deadlines", id: "d1", status: "verified" }]);
    expect(v.href).toBe("/app/tracker/a1#applying");
    const u = evaluateCatalogue(near("unverified")).open.find((s) => s.catalogueId === "S3.05")!;
    expect(u.reason).not.toContain("December");
    expect(u.reason).toContain("Check the deadline on the official page");
  });

  it("starts Go steps after an offer is accepted, the visa once the admission document is in (M5)", () => {
    const input = STAGE_FIXTURES["stage-7-accepted"]!.input;
    expect(ids(input)).toContain("S6.08");
    expect(buildCtx(input).stage).toBe(7);
    const received = { ...input, applications: input.applications.map((a) => ({ ...a, admissionDocumentAt: "2026-10-31T00:00:00Z" })) };
    expect(ids(received)).toContain("S7.01");
  });

  it("never quotes an unknown fact", () => {
    for (const s of scenarios().flatMap((i) => evaluateCatalogue(i).open)) for (const f of s.factRefs) expect(f.status).not.toBe("unknown");
  });
});

describe("M3 shortlist steps", () => {
  it("S2.05 quotes a verified minimum above the best score, with the requirement as its fact", () => {
    const s = evaluateCatalogue(shortlistStage()).open.find((x) => x.catalogueId === "S2.05")!;
    expect(s.id).toBe("S2.05:short-q-toefl");
    expect(s.href).toBe("/app/match#score-goals");
    expect(s.reason).toContain("asks for 100 in TOEFL iBT. Your best so far is 92.");
    expect(s.factRefs).toEqual([{ table: "requirements", id: "q-toefl", status: "verified" }]);
  });

  it("never starts S2.05 from an unverified minimum, another exam version, a met minimum or no score", () => {
    const none = (input: JourneyInput) => expect(ids(input)).not.toContain("S2.05");
    none(shortlistStage({ status: "unverified" }));
    none(shortlistStage({ scores: [{ id: "t1", exam: "toefl_ibt", examVersion: "2026-01", total: 5, takenOn: null }] }));
    none(shortlistStage({ scores: [{ id: "t1", exam: "toefl_ibt", examVersion: "legacy", total: 100, takenOn: null }] }));
    none(shortlistStage({ scores: [] }));
  });

  it("S3.01 asks for more courses below six shortlisted, and stops at six", () => {
    expect(evaluateCatalogue(shortlistStage()).open.find((x) => x.catalogueId === "S3.01")!.href).toBe("/app/shortlist#advice");
    expect(ids(shortlistStage({ shortlisted: 6 }))).not.toContain("S3.01");
  });

  it("S3.02 and S3.03 link to their panels, and all three complete when marked done", () => {
    const open = evaluateCatalogue(shortlistStage()).open;
    expect(open.find((x) => x.catalogueId === "S3.02")!.href).toBe("/app/shortlist#comparison");
    expect(open.find((x) => x.catalogueId === "S3.03")!.href).toBe("/app/shortlist#costs");
    const stepState = ["S3.01", "S3.02", "S3.03"].map((stepId) => ({ stepId, state: "done" as const, until: null }));
    const r = evaluateCatalogue({ ...shortlistStage(), stepState });
    expect(r.marked).toEqual(["S3.01", "S3.02", "S3.03"]);
  });

  it("S3.03 needs a budget", () => {
    const input = shortlistStage();
    expect(ids({ ...input, profile: { ...input.profile, budgetAmount: null } })).not.toContain("S3.03");
  });

  it("leaves the shortlist steps behind once the student is preparing", () => {
    const input = shortlistStage();
    const preparing = { ...input, applications: input.applications.map((a) => ({ ...a, status: "preparing" as const })) };
    expect(ids(preparing).filter((id) => id.startsWith("S3."))).toEqual([]);
    expect(ids(preparing)).toContain("S2.05");
  });
});

describe("own applications (J3.3)", () => {
  const own = STAGE_FIXTURES["edge-own-application-preparing"]!.input;

  it("gives an own application its checklist and fee steps, with no facts and no source", () => {
    const steps = evaluateCatalogue(own).open.filter((s) => s.application?.id === "own1");
    expect(steps.map((s) => s.catalogueId)).toEqual(["S4.01", "S4.14"]);
    for (const s of steps) {
      expect(s.factRefs, s.id).toEqual([]);
      expect(s.source, s.id).toBeUndefined();
      expect(s.application!.label).toBe("MSc Urban Planning, Universiteit Voorbeeld");
    }
  });

  it("ranks by the student's own date without quoting it", () => {
    const s = evaluateCatalogue(own).open.find((x) => x.catalogueId === "S4.01")!;
    expect(s.dueAt).toBe("2026-11-20T23:59:00Z");
    expect(s.reason).not.toContain("20 November");
  });

  it("lets a passed own deadline close preparation, like a published one", () => {
    expect(buildCtx(STAGE_FIXTURES["edge-own-deadline-passed"]!.input).stage).toBe(5);
    expect(buildCtx(own).stage).toBe(4);
  });

  it("never links an own application to a course page", () => {
    const accepted = { ...own, applications: own.applications.map((a) => ({ ...a, status: "decided" as const, decision: "admitted" as const, offerAcceptedAt: "2026-10-01T00:00:00Z" })) };
    for (const s of evaluateCatalogue(accepted).open) expect(s.href, s.id).not.toContain("/courses/");
  });
});

describe("test plans (J3.4)", () => {
  const testReq = { id: "q-ielts", kind: "language_test" as const, exam: "ielts_academic", testPolicy: null, countRequired: null, status: "verified" as const };
  const deadline = (dueAt: string) => [{ id: "d1", dueAt, timezone: "Europe/London", precision: "date", status: "verified" as const }];
  const input = (status: "shortlisted" | "preparing", testPlans: JourneyInput["testPlans"] = [], dueAt = "2027-03-01T23:59:00Z") =>
    base({ profile: readyProfile, testPlans, applications: [application("a1", programs.exampleton!, { status, requirements: [testReq], deadlines: deadline(dueAt) })] });
  const plan = (status: "not_taken" | "booked") => ({ exam: "ielts_academic", examVersion: null, status, bookedFor: status === "booked" ? "2027-01-10" : null });

  it("completes S1.05 when the course's test is marked not taken yet", () => {
    expect(ids(input("shortlisted"))).toContain("S1.05");
    expect(evaluateCatalogue(input("shortlisted", [plan("not_taken")])).completed).toContain("S1.05");
  });

  it("asks a student preparing an application to book its test, until it is booked or scored", () => {
    const s = evaluateCatalogue(input("preparing")).open.find((x) => x.catalogueId === "S4.11")!;
    expect(s.id).toBe("S4.11:a1");
    expect(s.href).toBe("/app/profile#test-plans");
    expect(s.factRefs).toEqual([{ table: "requirements", id: "q-ielts", status: "verified" }]);
    expect(ids(input("preparing", [plan("not_taken")]))).toContain("S4.11");
    expect(ids(input("preparing", [plan("booked")]))).not.toContain("S4.11");
    expect(ids({ ...input("preparing"), testScores: [{ id: "t", exam: "ielts_academic", examVersion: null, total: 7, takenOn: null }] })).not.toContain("S4.11");
  });

  it("ranks S4.11 as start soon from 30 days before the deadline", () => {
    const rank = (dueAt: string) => computeJourney(input("preparing", [], dueAt)).steps.find((x) => x.catalogueId === "S4.11")!.rank;
    expect(rank("2026-12-12T23:59:00Z")).toBe("long_lead"); // 40 days ahead: inside 30 + 14
    expect(rank("2027-03-01T23:59:00Z")).toBe("stage");
  });
});

describe("after accepting an offer (J5.1)", () => {
  const accepted = (over: Partial<import("../src").ApplicationSnapshot> = {}) =>
    base({
      profile: readyProfile,
      applications: [application("a1", programs.exampleton!, { status: "decided", decision: "admitted", offerAcceptedAt: "2026-10-20T00:00:00Z", ...over })],
    });

  it("asks for the admission document, then the visa once it has arrived", () => {
    expect(ids(accepted())).toContain("S6.08");
    expect(ids(accepted())).not.toContain("S7.01");
    const received = accepted({ admissionDocumentAt: "2026-10-25T00:00:00Z" });
    expect(ids(received)).not.toContain("S6.08");
    expect(ids(received)).toContain("S7.01");
  });

  it("asks to meet noted conditions until they're marked met, without a parent title", () => {
    const s = evaluateCatalogue(accepted({ conditions: { metAt: null } })).open.find((x) => x.catalogueId === "S6.05")!;
    expect(s.href).toBe("/app/offers#after-accept");
    expect(s.parentTitle).toBeUndefined();
    expect(ids(accepted({ conditions: { metAt: "2026-10-28T00:00:00Z" } }))).not.toContain("S6.05");
    expect(ids(accepted())).not.toContain("S6.05");
  });

  it("asks for the deposit when one is due, until it's paid", () => {
    expect(ids(accepted())).not.toContain("S6.06");
    expect(ids(accepted({ hasDepositDeadline: true }))).toContain("S6.06");
    const due = evaluateCatalogue(accepted({ depositDueAt: "2026-11-10T00:00:00Z" })).open.find((x) => x.catalogueId === "S6.06")!;
    expect(due.dueAt).toBe("2026-11-10T00:00:00Z");
    expect(due.parentTitle).toBe("Paying the deposit");
    expect(ids(accepted({ hasDepositDeadline: true, depositPaidAt: "2026-10-30T00:00:00Z" }))).not.toContain("S6.06");
  });
});

describe("declining other offers (J5.2)", () => {
  const offers = (declinedAt: string | null = null) =>
    base({
      profile: readyProfile,
      applications: [
        application("going", programs.exampleton!, { status: "decided", decision: "admitted", offerAcceptedAt: "2026-10-20T00:00:00Z" }),
        application("other", programs.tum!, { status: "decided", decision: "admitted", declinedAt }),
        application("wait", programs.state!, { status: "decided", decision: "waitlisted" }),
      ],
    });

  it("asks to let each other university know once an offer is accepted", () => {
    const steps = evaluateCatalogue(offers()).open.filter((s) => s.catalogueId === "S6.07");
    expect(steps.map((s) => s.id).sort()).toEqual(["S6.07:other", "S6.07:wait"]);
    expect(steps[0]!.href).toBe("/app/offers#others");
    expect(steps.find((s) => s.id === "S6.07:other")!.reason).toContain("Declining M.Sc. Informatik");
  });

  it("completes the step when declined, and a declined offer no longer counts", () => {
    const r = evaluateCatalogue(offers("2026-10-25T00:00:00Z"));
    expect(r.completed).toContain("S6.07:other");
    expect(r.open.map((s) => s.id)).toContain("S6.07:wait");
    expect(r.open.some((s) => s.application?.id === "other" && s.catalogueId !== "S6.07")).toBe(false);
  });

  it("asks nothing before an offer is accepted", () => {
    const input = offers();
    const before = { ...input, applications: input.applications.map((a) => ({ ...a, offerAcceptedAt: null })) };
    expect(ids(before)).not.toContain("S6.07");
  });
});

describe("document readiness and supervisor contacts (J5.3)", () => {
  const prep = (over: Partial<JourneyInput> = {}, level: "master" | "doctorate" = "master") =>
    base({
      profile: { ...readyProfile, intakeYear: 2027 },
      applications: [application("a1", { ...programs.tum!, level }, { status: "preparing", cycle: { id: "c", label: "2027-winter", startsOn: "2027-10-01" } })],
      ...over,
    });
  const passport = (expiresOn: string | null) => ({ readiness: [{ kind: "passport" as const, ready: true, expiresOn }] });

  it("asks for the passport until it's valid 18 months past the course start", () => {
    expect(ids(prep())).toContain("S4.13");
    expect(evaluateCatalogue(prep()).open.find((s) => s.catalogueId === "S4.13")!.href).toBe("/app/profile#readiness");
    expect(ids(prep(passport("2028-12-01")))).toContain("S4.13");
    expect(ids(prep(passport("2029-04-01")))).not.toContain("S4.13");
  });

  it("asks a doctorate applicant to contact a supervisor until one is logged for that application", () => {
    const doctorate = prep({ profile: { ...readyProfile, targetLevels: ["doctorate"], researchInterests: "x" } }, "doctorate");
    const s = evaluateCatalogue(doctorate).open.find((x) => x.catalogueId === "S4.09")!;
    expect(s.href).toBe("/app/tracker/a1#supervisors");
    expect(ids({ ...doctorate, supervisorContacts: [{ applicationId: "a1", reply: "none" }] })).not.toContain("S4.09");
    expect(ids(prep())).not.toContain("S4.09");
  });
});

