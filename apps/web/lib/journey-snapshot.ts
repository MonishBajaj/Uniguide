/**
 * Journey M1 (J1.6): reads the student's journey snapshot, runs the engine and stores the result.
 * The snapshot comes from the journey_snapshot RPC, already in the engine's camelCase shape; this
 * file only checks it. The same code runs for a signed-in student and for the daily recompute.
 */
import { type JourneyInput, type JourneyResult, computeJourney } from "@uniguide/journey";
import { z } from "zod";

const factStatus = z.enum(["verified", "unverified", "conflicting", "unknown"]);
const level = z.enum(["foundation", "diploma", "bachelor", "master", "doctorate"]);
const list = <T extends z.ZodType>(item: T) => z.array(item).default([]);
const program = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  institution: z.string(),
  country: z.string(),
  level,
});
/** An application's course: a catalogue course, or an own application's words with no id, slug or level (J3.3). */
const appProgram = program.extend({ id: z.string().nullable(), slug: z.string().nullable(), level: level.nullable() });

const snapshotSchema = z.object({
  profile: z.object({
    displayName: z.string().nullable(),
    residenceCountry: z.string(),
    consentState: z.enum(["not_required", "pending_parental", "granted", "revoked"]),
    homeQualification: z.string().nullable(),
    gradeValue: z.number().nullable(),
    gradeText: z.string().nullable(),
    gradeScale: z.string().nullable(),
    budgetAmount: z.number().nullable(),
    budgetCurrency: z.string().nullable(),
    targetLevels: list(level),
    targetCountries: list(z.string()),
    targetFields: list(z.string()),
    intakeYear: z.number().nullable(),
    researchInterests: z.string().nullable(),
    entryPath: z.enum(["exploring", "knows", "applying", "offers"]).nullable(),
  }),
  tracks: list(
    z.object({ id: z.string(), name: z.string(), targetLevels: list(level), targetCountries: list(z.string()), targetFields: list(z.string()) }),
  ),
  testScores: list(
    z.object({ id: z.string(), exam: z.string(), examVersion: z.string().nullable(), total: z.number().nullable(), takenOn: z.string().nullable() }),
  ),
  shortlist: list(z.object({ program, createdAt: z.string() })),
  applications: list(
    z.object({
      id: z.string(),
      status: z.enum(["shortlisted", "preparing", "submitted", "decided", "withdrawn"]),
      decision: z.enum(["admitted", "rejected", "waitlisted", "withdrawn", "deferred"]).nullable(),
      trackId: z.string().nullable(),
      offerAcceptedAt: z.string().nullable(),
      depositDueAt: z.string().nullable(),
      awardedAid: z.number().nullable(),
      portalCheckedAt: z.string().nullable(),
      createdAt: z.string(),
      own: z.boolean().default(false),
      ownDueAt: z.string().nullable().default(null),
      program: appProgram,
      cycle: z.object({ id: z.string(), label: z.string(), startsOn: z.string().nullable() }).nullable(),
      requirements: list(
        z.object({
          id: z.string(),
          kind: z.enum([
            "entry_qualification",
            "language_test",
            "admissions_test",
            "prerequisite",
            "recommendation_letters",
            "statement",
            "portfolio",
            "interview",
            "other",
          ]),
          exam: z.string().nullable(),
          testPolicy: z.string().nullable(),
          countRequired: z.number().nullable(),
          examVersion: z.string().nullable().default(null),
          minTotal: z.number().nullable().default(null),
          status: factStatus,
          sourceUrl: z.string().nullable().default(null),
        }),
      ),
      deadlines: list(
        z.object({
          id: z.string(),
          dueAt: z.string(),
          timezone: z.string(),
          precision: z.string(),
          status: factStatus,
          sourceUrl: z.string().nullable().default(null),
        }),
      ),
      checklist: list(
        z.object({
          id: z.string(),
          title: z.string(),
          done: z.boolean(),
          dueAt: z.string().nullable(),
          kind: z.string(),
          link: z.string().nullable(),
          countryRuleId: z.string().nullable(),
        }),
      ),
      documents: list(z.object({ id: z.string(), kind: z.string(), question: z.string().nullable(), versions: z.number(), reviews: z.number() })),
      letters: list(
        z.object({
          id: z.string(),
          recommenderId: z.string(),
          recommenderName: z.string(),
          status: z.enum(["not_asked", "asked", "agreed", "submitted", "declined"]),
          dueOn: z.string().nullable(),
        }),
      ),
      scoresSent: list(z.string()),
      costCount: z.number(),
      outcomeShared: z.boolean(),
    }),
  ),
  recommenders: list(z.object({ id: z.string(), name: z.string() })),
  countryRules: list(
    z.object({
      id: z.string(),
      destination: z.string(),
      kind: z.string(),
      title: z.string(),
      link: z.string().nullable(),
      status: factStatus,
      appliesTo: list(z.string()),
      sourceUrl: z.string().nullable().default(null),
    }),
  ),
  departureTasks: list(z.object({ applicationId: z.string(), taskKey: z.string() })),
  matchRuns: z.object({ latestAt: z.string().nullable(), feasibleCount: z.number().nullable() }).default({ latestAt: null, feasibleCount: null }),
  enrichment: z.object({ lastFinishedAt: z.string().nullable() }).default({ lastFinishedAt: null }),
  stepState: list(z.object({ stepId: z.string(), state: z.enum(["snoozed", "dismissed", "done"]), until: z.string().nullable() })),
  parentLinked: z.boolean().default(false),
  aiConsent: z.boolean().default(false),
  decisionMatrixSaved: z.boolean().default(false),
  cvEntries: z.number().default(0),
  portfolioItems: z.number().default(0),
  lastCompletedAt: z.string().nullable().default(null),
  sharedWith: z
    .object({ parents: list(z.string()), counselors: list(z.string()) })
    .default({ parents: [], counselors: [] }),
});

/** Checks a journey_snapshot document and adds the date. Throws naming the first wrong field. */
export function parseSnapshot(json: unknown, today: string): JourneyInput {
  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new Error(`Invalid journey snapshot at ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  return { ...parsed.data, today };
}

/** Today's date in UTC (plan D6: profiles have no time zone yet). */
export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type RpcResult = { data: unknown; error: { message: string } | null };
/** The one Supabase method this needs, so tests can pass a fake. */
export interface JourneyRpc {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

/** For the daily recompute: whose journey, and the token that allows it. */
export interface JourneyAs {
  userId: string;
  token: string;
}

/**
 * Loads the snapshot, runs the engine and saves the result. A failed save is logged, not thrown:
 * the result is still right, and a page must not break because history could not be written.
 */
export async function loadJourney(supabase: JourneyRpc, today = utcToday(), as?: JourneyAs): Promise<JourneyResult> {
  const who = as ? { p_user: as.userId, p_token: as.token } : {};
  const { data, error } = await supabase.rpc("journey_snapshot", who);
  if (error) throw new Error(`journey_snapshot failed: ${error.message}`);
  const result = computeJourney(parseSnapshot(data, today));
  const saved = await supabase.rpc("save_journey_state", { p_state: result, ...who });
  if (saved.error) console.error(`save_journey_state failed: ${saved.error.message}`);
  return result;
}
