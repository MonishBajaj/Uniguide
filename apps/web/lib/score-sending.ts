import { label } from "@/lib/format";

export type TestRequirement = { kind: string; exam: string | null; test_policy: string | null };
export type ScoreNeed = { key: string; label: string; exams: string[]; required: boolean };

/**
 * The scores a course asks for, from its published requirement rows. Accepted language tests are
 * alternatives (any one will do); each admissions test is its own need, counted only when required.
 */
export function scoreNeeds(requirements: TestRequirement[]): ScoreNeed[] {
  const usable = requirements.filter((r) => r.exam && r.test_policy !== "not_accepted");
  const needs: ScoreNeed[] = [];
  const language = [...new Set(usable.filter((r) => r.kind === "language_test").map((r) => r.exam!))];
  if (language.length) {
    needs.push({ key: "language", label: `a language test (${language.map(label).join(" or ")})`, exams: language, required: true });
  }
  for (const exam of new Set(usable.filter((r) => r.kind === "admissions_test").map((r) => r.exam!))) {
    const required = usable.some((r) => r.kind === "admissions_test" && r.exam === exam && r.test_policy === "required");
    needs.push({ key: exam, label: label(exam), exams: [exam], required });
  }
  return needs;
}

/** How many required scores have been sent, counting a need as met when any accepted exam was sent. */
export function sentProgress(needs: ScoreNeed[], sentExams: string[]) {
  const required = needs.filter((n) => n.required);
  return { sent: required.filter((n) => n.exams.some((e) => sentExams.includes(e))).length, needed: required.length };
}
