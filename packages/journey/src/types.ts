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
  /** When the student started planning for the next intake after rejections (M5, J5.4). */
  intakeRolledAt?: string | null;
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

/**
 * The course an application is for. For an own application (J3.3) there is no catalogue course: id, slug and
 * level are null, and title, institution and country are the student's own words.
 */
/** A planned test (J3.4): "not taken yet", or booked for a date. Only a saved score is a result. */
export interface TestPlan {
  exam: string;
  examVersion: string | null;
  status: "not_taken" | "booked";
  bookedFor: string | null;
}

export interface ProgramRef {
  id: string | null;
  slug: string | null;
  title: string;
  institution: string;
  country: string;
  level: Level | null;
}

export interface Requirement {
  id: string;
  kind: RequirementKind;
  exam: string | null;
  testPolicy: string | null;
  countRequired: number | null;
  /** Test requirements only: the exam version and published minimum total (M3, J3.1). */
  examVersion?: string | null;
  minTotal?: number | null;
  status: FactStatus;
  /** The official page the fact was taken from (M2, N13). */
  sourceUrl?: string | null;
}

export interface Deadline {
  id: string;
  dueAt: string;
  timezone: string;
  precision: string;
  status: FactStatus;
  sourceUrl?: string | null;
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
  /** A course that isn't in the catalogue, added by the student (J3.3). It has no cycle and no facts. */
  own?: boolean;
  /** An own application's deadline, as the student was given it. Counts for the stage rules and ranking, never quoted as a fact. */
  ownDueAt?: string | null;
  program: ProgramRef;
  cycle: { id: string; label: string; startsOn: string | null } | null;
  requirements: Requirement[];
  deadlines: Deadline[];
  checklist: ChecklistItem[];
  documents: DocumentRow[];
  letters: LetterRequest[];
  /** Exams marked as sent to this application (4.5). */
  scoresSent: string[];
  costCount: number;
  outcomeShared: boolean;
  // M5: after an offer, and while waiting. All student-entered dates, never facts.
  /** The offer's conditions, if the student noted any; the text itself never leaves the student's own table. */
  conditions?: { metAt: string | null } | null;
  depositPaidAt?: string | null;
  /** The course publishes a deposit deadline. */
  hasDepositDeadline?: boolean;
  admissionDocumentAt?: string | null;
  declinedAt?: string | null;
  expectedDecisionOn?: string | null;
  /** Interview times the student logged. */
  interviews?: string[];
  /** Portal checks that noted something missing and aren't resolved yet. */
  missingNotes?: number;
  /** Published housing facts for the course's institution (7.3). */
  housingFacts?: number;
}

export interface CountryRuleRow {
  id: string;
  destination: string;
  kind: string;
  title: string;
  link: string | null;
  status: FactStatus;
  appliesTo: string[];
  /** The rule's own official link, or its source page. */
  sourceUrl?: string | null;
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
  testPlans: TestPlan[];
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
  /** Names of linked parents and of counselor organisations with an active share (M2 home). */
  sharedWith: { parents: string[]; counselors: string[] };
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
  /** The student can mark it done themselves (plan D8). */
  markable: boolean;
  factRefs: FactRef[];
  /** Where the quoted fact comes from: its official page, else the course page or /visas (M2, N4, N13). */
  source?: { href: string };
  trackLabel?: string;
  application?: { id: string; label: string };
  /** Safe wording for the parent view; omitted means the step is never shown to parents. */
  parentTitle?: string;
}

/** A step the student snoozed or dismissed, so the steps page can bring it back. */
export interface HiddenStep {
  id: string;
  catalogueId: string;
  title: string;
  state: "snoozed" | "dismissed";
  until: string | null;
  /** The application it's about, so two hidden steps with the same title can be told apart. */
  application?: { id: string; label: string };
}

export interface JourneyResult {
  stage: Stage;
  /** For example { done: 2, total: 3, label: "2 of 3 applications ready" }. */
  stageProgress: { done: number; total: number; label: string };
  /** Ranked; the home shows the first three. */
  steps: NextStep[];
  /** Ids of steps that apply and are done; save_journey_state logs new ones (plan D13). */
  completed: string[];
  /** Ids in `completed` that are done only because the student marked them. */
  marked: string[];
  /** Snoozed (until their date) and dismissed steps. */
  hidden: HiddenStep[];
  urgentCount: number;
  /** A sentence for badges, e.g. "2 steps due this fortnight"; null when nothing is urgent. */
  urgentLabel: string | null;
  stalled: boolean;
  engineVersion: string;
}
