/**
 * Journey engine types (spec section 4.1). `JourneyInput` mirrors the JSON returned by the
 * `journey_snapshot` RPC, which builds these camelCase keys directly, so the web app parses it
 * without renaming. Differences from the spec are listed in the M1 plan (D1–D13, I3).
 */

export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Level = "foundation" | "diploma" | "bachelor" | "master" | "doctorate";
/** Degree variants that change which steps apply (spec 3.3, plan D1). */
export type Variant = "undergraduate" | "masters" | "research";
export type FactStatus = "verified" | "unverified" | "conflicting" | "unknown";
export type ConsentState = "not_required" | "pending_parental" | "granted" | "revoked";
export type EntryPath = "exploring" | "knows" | "applying" | "offers";
export type AppStatus = "shortlisted" | "preparing" | "submitted" | "decided" | "withdrawn";
export type Decision = "admitted" | "rejected" | "waitlisted" | "withdrawn" | "deferred";
export type RequirementKind =
  | "entry_qualification"
  | "language_test"
  | "admissions_test"
  | "prerequisite"
  | "recommendation_letters"
  | "statement"
  | "portfolio"
  | "interview"
  | "other";

export interface ProfileSnapshot {
  displayName: string | null;
  residenceCountry: string;
  consentState: ConsentState;
  homeQualification: string | null;
  gradeValue: number | null;
  gradeText: string | null;
  gradeScale: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  targetLevels: Level[];
  targetCountries: string[];
  targetFields: string[];
  intakeYear: number | null;
  researchInterests: string | null;
  entryPath: EntryPath | null;
}

export interface TrackSnapshot {
  id: string;
  name: string;
  targetLevels: Level[];
  targetCountries: string[];
  targetFields: string[];
}

export interface TestScore {
  id: string;
  exam: string;
  examVersion: string | null;
  total: number | null;
  takenOn: string | null;
}

export interface ProgramRef {
  id: string;
  slug: string;
  title: string;
  institution: string;
  country: string;
  level: Level;
}

export interface Requirement {
  id: string;
  kind: RequirementKind;
  exam: string | null;
  testPolicy: string | null;
  countRequired: number | null;
  status: FactStatus;
}

export interface Deadline {
  id: string;
  dueAt: string;
  timezone: string;
  precision: string;
  status: FactStatus;
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  kind: string;
  link: string | null;
  countryRuleId: string | null;
}

export interface DocumentRow {
  id: string;
  kind: string;
  question: string | null;
  versions: number;
  reviews: number;
}

export interface LetterRequest {
  id: string;
  recommenderId: string;
  recommenderName: string;
  status: "not_asked" | "asked" | "agreed" | "submitted" | "declined";
  dueOn: string | null;
}

export interface ShortlistRow {
  program: ProgramRef;
  createdAt: string;
}

export interface ApplicationSnapshot {
  id: string;
  status: AppStatus;
  decision: Decision | null;
  trackId: string | null;
  offerAcceptedAt: string | null;
  depositDueAt: string | null;
  awardedAid: number | null;
  portalCheckedAt: string | null;
  createdAt: string;
  program: ProgramRef;
  cycle: { id: string; label: string; startsOn: string | null };
  requirements: Requirement[];
  deadlines: Deadline[];
  checklist: ChecklistItem[];
  documents: DocumentRow[];
  letters: LetterRequest[];
  /** Exams marked as sent to this application (4.5). */
  scoresSent: string[];
  costCount: number;
  outcomeShared: boolean;
}

export interface CountryRuleRow {
  id: string;
  destination: string;
  kind: string;
  title: string;
  link: string | null;
  status: FactStatus;
  appliesTo: string[];
}

export interface DepartureTaskRow {
  applicationId: string;
  taskKey: string;
}

export interface StepStateRow {
  stepId: string;
  state: "snoozed" | "dismissed" | "done";
  until: string | null;
}

export interface JourneyInput {
  /** ISO date (YYYY-MM-DD). The UTC date until profiles store a time zone (plan D6). */
  today: string;
  profile: ProfileSnapshot;
  tracks: TrackSnapshot[];
  testScores: TestScore[];
  shortlist: ShortlistRow[];
  applications: ApplicationSnapshot[];
  recommenders: { id: string; name: string }[];
  countryRules: CountryRuleRow[];
  departureTasks: DepartureTaskRow[];
  matchRuns: { latestAt: string | null; feasibleCount: number | null };
  enrichment: { lastFinishedAt: string | null };
  stepState: StepStateRow[];
  parentLinked: boolean;
  aiConsent: boolean;
  decisionMatrixSaved: boolean;
  cvEntries: number;
  portfolioItems: number;
  /** When the student last completed a step (journey_events), for stalled detection (plan D13). */
  lastCompletedAt: string | null;
}

export type Band = "urgent" | "long_lead" | "stage" | "carry_over";

export interface FactRef {
  table: string;
  id: string;
  status: Exclude<FactStatus, "unknown">;
}

export interface NextStep {
  /** Catalogue id plus subject, e.g. "S4.07:app_123". */
  id: string;
  catalogueId: string;
  stage: Stage;
  /** Imperative, at most 60 characters. */
  title: string;
  /** One sentence, at most 160 characters. */
  reason: string;
  /** Message key and parameters, so the web app can translate later (plan I3). */
  copy: { key: string; params: Record<string, string> };
  href: string;
  dueAt: string | null;
  rank: Band;
  dismissable: boolean;
  factRefs: FactRef[];
  trackLabel?: string;
  application?: { id: string; label: string };
  /** Safe wording for the parent view; omitted means the step is never shown to parents. */
  parentTitle?: string;
}

export interface JourneyResult {
  stage: Stage;
  /** For example { done: 2, total: 3, label: "2 of 3 applications ready" }. */
  stageProgress: { done: number; total: number; label: string };
  /** Ranked; the home shows the first three. */
  steps: NextStep[];
  /** Ids of steps that apply and are done; save_journey_state logs new ones (plan D13). */
  completed: string[];
  urgentCount: number;
  /** A sentence for badges, e.g. "2 steps due this fortnight"; null when nothing is urgent. */
  urgentLabel: string | null;
  stalled: boolean;
  engineVersion: string;
}
