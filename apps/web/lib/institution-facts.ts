import type { Tables } from "@uniguide/db-types";

export type InstitutionFact = {
  id: string;
  kind: string;
  title: string;
  details: string | null;
  amount: number | null;
  currency: string | null;
  period: string | null;
  hoursPerWeek: number | null;
  link: string | null;
  status: string;
  evidenceQuote: string;
  programId: string | null;
};

export const toInstitutionFact = (row: Tables<"institution_facts">): InstitutionFact => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  details: row.details,
  amount: row.amount,
  currency: row.currency,
  period: row.period,
  hoursPerWeek: row.hours_per_week,
  link: row.link,
  status: row.status,
  evidenceQuote: row.evidence_quote,
  programId: row.program_id,
});

/** Institution-wide facts plus this program's own, of the given kinds. Another program's facts never appear. */
export function factsFor(facts: InstitutionFact[], programId: string, kinds: string[]): InstitutionFact[] {
  return facts.filter((f) => kinds.includes(f.kind) && (f.programId === null || f.programId === programId));
}

const ARRIVAL_ORDER = ["airport", "arrival_support", "course_registration"];

/** The arrival guide's sections, in reading order, without the empty ones. */
export function arrivalSections(facts: InstitutionFact[]): { kind: string; facts: InstitutionFact[] }[] {
  return ARRIVAL_ORDER.map((kind) => ({ kind, facts: facts.filter((f) => f.kind === kind) })).filter((s) => s.facts.length > 0);
}
