import "server-only";
import type {
  CostFact,
  FxTable,
  ProgramInput,
  RequirementFact,
  StudentProfile,
  TestScore,
} from "@uniguide/matching";
import type { Tables, ViewRow } from "@uniguide/db-types";
import { toDeadlineFact } from "@/lib/deadline-fact";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type SourceRef = { url: string; owner: string } | null;
export type RequirementRow = Tables<"requirements"> & { sources: SourceRef };
export type DeadlineRow = Tables<"deadlines"> & { sources: SourceRef };
export type CostRow = Tables<"cost_items"> & { sources: SourceRef };
export type CycleFacts = Pick<
  Tables<"program_cycles">,
  "id" | "program_id" | "label" | "intake_year" | "intake_term" | "starts_on"
> & {
  requirements: RequirementRow[];
  deadlines: DeadlineRow[];
  cost_items: CostRow[];
};
export type ProgramCard = ViewRow<"program_cards">;

const CYCLE_SELECT =
  "id, program_id, label, intake_year, intake_term, starts_on, requirements(*, sources(url, owner)), deadlines(*, sources(url, owner)), cost_items(*, sources(url, owner))";

/** The current cycle (latest intake) of each program, with every published fact and its source. */
export async function loadCurrentCycles(supabase: Supabase, programIds: string[]): Promise<Map<string, CycleFacts>> {
  const cycles = new Map<string, CycleFacts>();
  if (programIds.length === 0) return cycles;
  const { data, error } = await supabase
    .from("program_cycles")
    .select(CYCLE_SELECT)
    .in("program_id", programIds)
    .eq("is_current", true)
    .order("intake_year", { ascending: false })
    .returns<CycleFacts[]>();
  if (error) throw error;
  for (const cycle of data ?? []) {
    if (!cycles.has(cycle.program_id)) cycles.set(cycle.program_id, cycle);
  }
  return cycles;
}

/** One named intake of a program, for the per-intake pages. */
export async function loadCycle(supabase: Supabase, programId: string, label: string): Promise<CycleFacts | null> {
  const { data } = await supabase
    .from("program_cycles")
    .select(CYCLE_SELECT)
    .eq("program_id", programId)
    .eq("label", label)
    .returns<CycleFacts[]>()
    .maybeSingle();
  return data;
}

/** An intake by id, for a tracked application. */
export async function loadCycleById(supabase: Supabase, cycleId: string): Promise<CycleFacts | null> {
  const { data } = await supabase.from("program_cycles").select(CYCLE_SELECT).eq("id", cycleId).returns<CycleFacts[]>().maybeSingle();
  return data;
}

export async function loadFx(supabase: Supabase): Promise<FxTable> {
  const { data } = await supabase.from("fx_rates").select("*").order("as_of", { ascending: false });
  const fx: FxTable = {};
  for (const r of data ?? []) {
    const key = `${r.base}->${r.quote}`;
    fx[key] ??= { rate: Number(r.rate), asOf: r.as_of, source: r.source };
  }
  return fx;
}

const num = (v: number | null) => (v == null ? null : Number(v));

export function toProgramInput(card: ProgramCard, cycle: CycleFacts | undefined): ProgramInput {
  return {
    id: card.id!,
    level: card.level!,
    country: card.country!,
    iscedF: card.isced_f,
    deliveryMode: card.delivery_mode!,
    durationMonths: card.duration_months,
    requiredCredits: num(card.required_credits),
    requirements: (cycle?.requirements ?? []).map(
      (r): RequirementFact => ({
        id: r.id,
        status: r.status,
        applicantCategory: r.applicant_category,
        kind: r.kind,
        qualification: r.qualification,
        minGradeNumeric: num(r.min_grade_numeric),
        minGradeText: r.min_grade_text,
        gradeScale: r.grade_scale,
        exam: r.exam,
        examVersion: r.exam_version,
        minTotal: num(r.min_total),
        minSections: (r.min_sections as Record<string, number> | null) ?? null,
        testPolicy: r.test_policy,
        isDesirable: r.is_desirable,
        countRequired: r.count_required,
        wordLimit: r.word_limit,
        details: r.details,
        minCredits: num(r.min_credits),
        creditSystem: r.credit_system,
      }),
    ),
    deadlines: (cycle?.deadlines ?? []).map(toDeadlineFact),
    costs: (cycle?.cost_items ?? []).map(
      (c): CostFact => ({
        id: c.id,
        status: c.status,
        applicantCategory: c.applicant_category,
        kind: c.kind,
        basis: c.basis,
        low: Number(c.low),
        base: Number(c.base),
        high: Number(c.high),
        currency: c.currency,
        mandatory: c.mandatory,
      }),
    ),
  };
}

export function toStudentProfile(profile: Tables<"profiles">, scores: Tables<"test_scores">[]): StudentProfile {
  const prefs = (profile.preferences ?? {}) as { preferredDelivery?: StudentProfile["preferredDelivery"] };
  const credits = {
    priorCredits: num(profile.prior_credits),
    priorCreditSystem: profile.prior_credit_system,
    classPercentile: profile.class_percentile,
  };
  return {
    residenceCountry: profile.residence_country,
    homeQualification: profile.home_qualification,
    gradeValue: num(profile.grade_value),
    gradeScale: profile.grade_scale,
    budget:
      profile.budget_amount && profile.budget_currency
        ? { amount: Number(profile.budget_amount), currency: profile.budget_currency }
        : null,
    targetLevels: profile.target_levels,
    targetCountries: profile.target_countries,
    targetFields: profile.target_fields,
    preferredDelivery: prefs.preferredDelivery ?? null,
    ...credits,
    testScores: scores.map(
      (s): TestScore => ({
        exam: s.exam,
        examVersion: s.exam_version,
        takenOn: s.taken_on,
        total: num(s.total),
        sections: (s.sections as Record<string, number>) ?? {},
      }),
    ),
  };
}
