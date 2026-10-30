import type {
  ApplicationSnapshot,
  CountryRuleRow,
  DocumentRow,
  FactRef,
  JourneyInput,
  LetterRequest,
  Requirement,
  Stage,
  Variant,
} from "../types";

/** What the catalogue reads, worked out once per input. */
export interface Ctx {
  input: JourneyInput;
  today: string;
  stage: Stage;
  variants: Variant[];
  /** Applications that still count (withdrawn and deferred ones are left out). */
  apps: ApplicationSnapshot[];
  /** Target countries from the profile and every track. */
  countries: string[];
  /** True when the student marked this step done themselves (plan D8). */
  marked(stepId: string): boolean;
}

/**
 * What one step is about. A step with no `key` is about the student; otherwise the key is added to
 * the step id ("S4.07:app_123"). A subject with an `app` belongs to that application's own stage,
 * so it shows whatever stage the student is in (spec 4.3 carry-over).
 */
export interface Subject {
  key: string | null;
  app?: ApplicationSnapshot;
  rule?: CountryRuleRow;
  requirement?: Requirement;
  letter?: LetterRequest;
  recommender?: { id: string; name: string };
  doc?: DocumentRow;
  exam?: string;
}

export interface StepDef {
  id: string;
  stage: Stage;
  /** Shown only to students in one of these degree variants (spec 3.3). */
  variants?: Variant[];
  dismissable: boolean;
  /** The last stage where a student-level step still helps; past it the step is dropped, not carried over. */
  until?: Stage;
  /** False until the feature, data or link the step needs exists (plan "Deviations"). */
  available: boolean;
  /** Default lead time in days, used for ranking only and never shown (spec 4.3). */
  leadDays?: number;
  /** Done when the student marks it done, for steps whose real completion can't be seen (D8). */
  markable?: boolean;
  /** Safe wording for a linked parent; never set on writing, grade or score steps. */
  parentTitle?: string;
  subjects?(ctx: Ctx): Subject[];
  applies?(ctx: Ctx, s: Subject): boolean;
  done(ctx: Ctx, s: Subject): boolean;
  dueAt?(ctx: Ctx, s: Subject): string | null;
  factRefs?(ctx: Ctx, s: Subject): FactRef[];
  href(ctx: Ctx, s: Subject): string;
  /** Message key; defaults to the step id. */
  copyKey?(ctx: Ctx, s: Subject): string;
  params?(ctx: Ctx, s: Subject): Record<string, string>;
}
