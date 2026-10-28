// Inputs and outputs of the matching engine. Deliberately independent of the database types so
// the engine stays a pure function of its inputs (and can be reused by the what-if simulator).

export type FactStatus = "verified" | "unverified" | "conflicting" | "unknown";
export type ProgramLevel = "foundation" | "diploma" | "bachelor" | "master" | "doctorate";
export type DeliveryMode = "on_campus" | "online" | "hybrid";
export type ApplicantCategory = "all" | "domestic" | "international" | "eu_eea" | "uk_home";
export type CostBasis = "per_credit" | "per_term" | "per_year" | "per_month" | "total" | "one_off";
export type CostKind = "tuition" | "fees" | "insurance" | "living" | "application_fee" | "other";
export type TestPolicy =
  | "required"
  | "recommended"
  | "optional"
  | "not_accepted"
  | "waived_conditional"
  | "unknown"
  | "conflicting";

interface Fact {
  id: string;
  status: FactStatus;
  applicantCategory: ApplicantCategory;
}

export interface RequirementFact extends Fact {
  kind:
    | "entry_qualification"
    | "language_test"
    | "admissions_test"
    | "prerequisite"
    | "recommendation_letters"
    | "statement"
    | "portfolio"
    | "interview"
    | "other";
  qualification?: string | null;
  minGradeNumeric?: number | null;
  minGradeText?: string | null;
  gradeScale?: string | null;
  exam?: string | null;
  examVersion?: string | null;
  minTotal?: number | null;
  minSections?: Record<string, number> | null;
  testPolicy?: TestPolicy | null;
  isDesirable?: boolean;
}

export interface DeadlineFact extends Fact {
  kind: "application" | "priority" | "funding" | "scholarship" | "documents" | "deposit";
  /** ISO timestamp. For precision "date" this is local midnight at the start of the stated day. */
  dueAt: string;
  precision: "exact_time" | "date" | "month";
  /** IANA zone the institution states; display dates in it, never in the server's zone. */
  timezone?: string;
}

export interface CostFact extends Fact {
  kind: CostKind;
  basis: CostBasis;
  low: number;
  base: number;
  high: number;
  currency: string;
  mandatory: boolean;
}

export interface ProgramInput {
  id: string;
  level: ProgramLevel;
  country: string;
  iscedF?: string | null;
  deliveryMode: DeliveryMode;
  durationMonths?: number | null;
  requiredCredits?: number | null;
  requirements: RequirementFact[];
  deadlines: DeadlineFact[];
  costs: CostFact[];
}

export interface TestScore {
  exam: string;
  examVersion?: string | null;
  /** ISO date */
  takenOn?: string | null;
  total?: number | null;
  sections?: Record<string, number>;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface StudentProfile {
  residenceCountry: string;
  homeQualification?: string | null;
  gradeValue?: number | null;
  gradeScale?: string | null;
  budget?: Money | null;
  targetLevels?: ProgramLevel[];
  /** In order of preference; the first is the favourite. */
  targetCountries?: string[];
  /** ISCED-F codes or prefixes. */
  targetFields?: string[];
  deliveryModes?: DeliveryMode[];
  preferredDelivery?: DeliveryMode | null;
  testScores?: TestScore[];
  /** Only aid the student has actually been awarded. Never pass expected or hoped-for aid. */
  awardedAid?: Money[];
}

export interface FxRate {
  rate: number;
  asOf: string;
  source: string;
}

/** Keyed "GBP->USD". */
export type FxTable = Record<string, FxRate>;

export interface MatchContext {
  now: Date;
  fx: FxTable;
  /** Programs whose base-case cost exceeds budget × tolerance are excluded. */
  budgetTolerance?: number;
}

export type EligibilityResult = "meets" | "does_not_meet" | "needs_clarification";

export interface EligibilityCheck {
  kind: RequirementFact["kind"] | "deadline";
  result: EligibilityResult;
  reason: string;
  factIds: string[];
}

export interface Eligibility {
  overall: EligibilityResult;
  checks: EligibilityCheck[];
}

export interface CostLine {
  factId: string;
  kind: CostKind;
  basis: CostBasis;
  multiplier: number;
  low: number;
  base: number;
  high: number;
  currency: string;
  status: FactStatus;
}

export interface CostScenarios {
  currency: string | null;
  low: number;
  base: number;
  high: number;
  lines: CostLine[];
  /** False when a needed fact or conversion is missing; totals are then a lower bound. */
  complete: boolean;
  missing: string[];
  assumptions: string[];
  /** Totals in the student's budget currency, when a rate is available. Always approximate. */
  converted: (Money & { low: number; high: number; rate: FxRate; approximate: true }) | null;
  aidApplied: number;
}

export type Criterion = "field" | "budget" | "location" | "delivery";
export type Weights = Record<Criterion, number>;

export interface FitComponent {
  criterion: Criterion;
  weight: number;
  /** 0..1, or null when the program is missing the data (counted as 0). */
  value: number | null;
}

export interface FitScore {
  /** "Suitability", 0..100. Never an admission chance. Null when no criterion applies. */
  score: number | null;
  components: FitComponent[];
  /** Share of the weighted criteria the program had data for. */
  dataCoverage: number;
}

export interface Exclusion {
  rule: "level" | "country" | "field" | "delivery" | "deadline_passed" | "budget" | "ineligible";
  reason: string;
  factIds: string[];
}

export interface MatchResult {
  programId: string;
  excluded: boolean;
  exclusions: Exclusion[];
  eligibility: Eligibility;
  cost: CostScenarios;
  fit: FitScore;
  nextDeadline: DeadlineFact | null;
}
