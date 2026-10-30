/**
 * Journey fixtures: one snapshot per stage and per entry path, plus edge cases. Shaped exactly like
 * the `journey_snapshot` RPC output so the web loader's tests reuse them.
 */
import type { ApplicationSnapshot, JourneyInput, ProfileSnapshot, ProgramRef } from "../src";

export const TODAY = "2026-11-02";

export const emptyProfile: ProfileSnapshot = {
  displayName: "Asha",
  residenceCountry: "IN",
  consentState: "not_required",
  homeQualification: null,
  gradeValue: null,
  gradeText: null,
  gradeScale: null,
  budgetAmount: null,
  budgetCurrency: null,
  targetLevels: [],
  targetCountries: [],
  targetFields: [],
  intakeYear: null,
  researchInterests: null,
  entryPath: null,
};

/** Everything matching needs, but no test score (plan D4). */
export const readyProfile: ProfileSnapshot = {
  ...emptyProfile,
  homeQualification: "bachelor_4yr",
  gradeValue: 8.4,
  gradeScale: "gpa_10",
  budgetAmount: 60000,
  budgetCurrency: "USD",
  targetLevels: ["master"],
  targetCountries: ["GB", "DE", "US"],
  targetFields: ["0613"],
  intakeYear: 2027,
};

export function base(overrides: Partial<JourneyInput> = {}): JourneyInput {
  return {
    today: TODAY,
    profile: emptyProfile,
    tracks: [],
    testScores: [],
    shortlist: [],
    applications: [],
    recommenders: [],
    countryRules: [],
    departureTasks: [],
    matchRuns: { latestAt: null, feasibleCount: null },
    enrichment: { lastFinishedAt: null },
    stepState: [],
    parentLinked: false,
    aiConsent: false,
    decisionMatrixSaved: false,
    cvEntries: 0,
    portfolioItems: 0,
    lastCompletedAt: null,
    sharedWith: { parents: [], counselors: [] },
    ...overrides,
  };
}

export const programs: Record<string, ProgramRef> = {
  exampleton: { id: "p-exampleton", slug: "exampleton-msc-data-science", title: "MSc Data Science", institution: "University of Exampleton", country: "GB", level: "master" },
  tum: { id: "p-tum", slug: "tu-beispielstadt-msc-informatik", title: "M.Sc. Informatik", institution: "Technische Universität Beispielstadt", country: "DE", level: "master" },
  state: { id: "p-state", slug: "example-state-ms-computer-science", title: "MS in Computer Science", institution: "Example State University", country: "US", level: "master" },
};

export function application(id: string, program: ProgramRef, overrides: Partial<ApplicationSnapshot> = {}): ApplicationSnapshot {
  return {
    id,
    status: "shortlisted",
    decision: null,
    trackId: null,
    offerAcceptedAt: null,
    depositDueAt: null,
    awardedAid: null,
    portalCheckedAt: null,
    createdAt: "2026-10-01T09:00:00Z",
    program,
    cycle: { id: `c-${id}`, label: "2027-autumn", startsOn: "2027-09-20" },
    requirements: [],
    deadlines: [{ id: `d-${id}`, dueAt: "2027-01-15T23:59:00Z", timezone: "Europe/London", precision: "date", status: "verified" }],
    checklist: [],
    documents: [],
    letters: [],
    scoresSent: [],
    costCount: 0,
    outcomeShared: false,
    ...overrides,
  };
}

const matched = { latestAt: "2026-10-20T10:00:00Z", feasibleCount: 12 };

/** Fixtures by name, with the stage each must give. */
export const STAGE_FIXTURES: Record<string, { input: JourneyInput; stage: number }> = {
  "stage-1-new-account": { input: base(), stage: 1 },
  "stage-2-exploring": { input: base({ profile: { ...readyProfile, entryPath: "exploring" }, matchRuns: matched }), stage: 2 },
  "stage-3-shortlisted": {
    input: base({ profile: readyProfile, matchRuns: matched, shortlist: [{ program: programs.exampleton!, createdAt: "2026-10-21T10:00:00Z" }] }),
    stage: 3,
  },
  "stage-4-preparing": {
    input: base({ profile: readyProfile, matchRuns: matched, applications: [application("a1", programs.exampleton!, { status: "preparing" })] }),
    stage: 4,
  },
  "stage-5-submitted": {
    input: base({ profile: readyProfile, applications: [application("a1", programs.exampleton!, { status: "submitted", portalCheckedAt: "2026-10-01T10:00:00Z" })] }),
    stage: 5,
  },
  "stage-6-admitted": {
    input: base({ profile: readyProfile, applications: [application("a1", programs.exampleton!, { status: "decided", decision: "admitted", depositDueAt: "2026-11-20T00:00:00Z" })] }),
    stage: 6,
  },
  "stage-7-accepted": {
    input: base({
      profile: readyProfile,
      applications: [application("a1", programs.tum!, { status: "decided", decision: "admitted", offerAcceptedAt: "2026-10-30T12:00:00Z" })],
    }),
    stage: 7,
  },
  // Entry paths (spec 3.2): the answer only decides where onboarding sends the student first;
  // the stage always comes from data.
  "entry-exploring": { input: base({ profile: { ...readyProfile, entryPath: "exploring" } }), stage: 2 },
  "entry-knows": { input: base({ profile: { ...readyProfile, entryPath: "knows" }, matchRuns: matched }), stage: 2 },
  "entry-applying": {
    input: base({ profile: { ...readyProfile, entryPath: "applying" }, applications: [application("a1", programs.state!, { status: "preparing" })] }),
    stage: 4,
  },
  "entry-offers": {
    input: base({ profile: { ...readyProfile, entryPath: "offers" }, applications: [application("a1", programs.exampleton!, { status: "decided", decision: "admitted" })] }),
    stage: 6,
  },
  // Edge cases from the plan's Review Focus.
  "edge-split-submitted-preparing": {
    input: base({
      profile: readyProfile,
      applications: [
        application("a1", programs.exampleton!, { status: "submitted" }),
        application("a2", programs.tum!, { status: "preparing" }),
      ],
    }),
    stage: 4,
  },
  "edge-preparing-deadline-passed": {
    input: base({
      profile: readyProfile,
      applications: [
        application("a1", programs.exampleton!, { status: "submitted" }),
        application("a2", programs.tum!, {
          status: "preparing",
          deadlines: [{ id: "d-a2", dueAt: "2026-10-01T23:59:00Z", timezone: "Europe/Berlin", precision: "date", status: "verified" }],
        }),
      ],
    }),
    stage: 5,
  },
  "edge-rejected-everywhere": {
    input: base({
      profile: readyProfile,
      applications: [
        application("a1", programs.exampleton!, { status: "decided", decision: "rejected" }),
        application("a2", programs.tum!, { status: "decided", decision: "rejected" }),
      ],
    }),
    stage: 5,
  },
  "edge-withdrawn-only": {
    input: base({ profile: readyProfile, applications: [application("a1", programs.exampleton!, { status: "withdrawn" })] }),
    stage: 2,
  },
  "edge-pending-consent": { input: base({ profile: { ...emptyProfile, consentState: "pending_parental" } }), stage: 1 },
  // M2: consent blocks every step whatever the data says. Pending consent leaves only S1.06; revoked leaves nothing,
  // because /consent can't help (M2 plan N17).
  "edge-pending-consent-with-application": {
    input: base({
      profile: { ...readyProfile, consentState: "pending_parental" },
      applications: [application("a1", programs.tum!, { status: "preparing" })],
    }),
    stage: 4,
  },
  "edge-revoked-consent": {
    input: base({
      profile: { ...readyProfile, consentState: "revoked" },
      applications: [application("a1", programs.tum!, { status: "preparing" })],
    }),
    stage: 4,
  },
  "edge-targets-only-on-a-track": {
    input: base({
      profile: { ...readyProfile, targetLevels: [], targetCountries: [], targetFields: [] },
      tracks: [{ id: "t1", name: "MBA", targetLevels: ["master"], targetCountries: ["US"], targetFields: ["0413"] }],
    }),
    stage: 2,
  },
  "edge-doctorate-needs-research-interests": {
    input: base({ profile: { ...readyProfile, targetLevels: ["doctorate"] } }),
    stage: 1,
  },
};
