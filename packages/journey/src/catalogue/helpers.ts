import type { ApplicationSnapshot, FactRef, FactStatus, Requirement } from "../types";
import type { Subject } from "./types";

export const STUDENT: Subject[] = [{ key: null }];

export const courseLabel = (app: ApplicationSnapshot) => `${app.program.title}, ${app.program.institution}`;

export const appSubjects = (apps: ApplicationSnapshot[]): Subject[] => apps.map((app) => ({ key: app.id, app }));

/** A fact reference, or nothing for a fact whose status is unknown (unknown facts are never quoted). */
export function ref(table: string, id: string, status: FactStatus): FactRef[] {
  return status === "unknown" ? [] : [{ table, id, status }];
}

export const known = (r: { status: FactStatus }) => r.status !== "unknown";

/** Days from `from` to `to` (dates or timestamps), by calendar date. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The application's next published deadline that is today or later. */
export function nextDeadline(app: ApplicationSnapshot, today: string) {
  return (
    app.deadlines
      .filter((d) => known(d) && d.dueAt.slice(0, 10) >= today)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null
  );
}

export const deadlineRefs = (app: ApplicationSnapshot, today: string): FactRef[] => {
  const d = nextDeadline(app, today);
  return d ? ref("deadlines", d.id, d.status) : [];
};

/** The test requirements a course actually asks for: every language test, and admissions tests marked required. */
export const testRequirements = (app: ApplicationSnapshot): Requirement[] =>
  app.requirements.filter(
    (r) => known(r) && (r.kind === "language_test" || (r.kind === "admissions_test" && r.testPolicy === "required")),
  );

export const requirementsOf = (app: ApplicationSnapshot, kind: Requirement["kind"]) =>
  app.requirements.filter((r) => r.kind === kind && known(r));

/** "{course} asks…" for verified facts, "may ask… check" otherwise (spec 4.4). */
export const checkSuffix = (facts: { status: FactStatus }[]) => (facts.some((f) => f.status === "verified") ? "" : ".check");

const ENGLISH_EXAMS = new Set(["ielts_academic", "ielts_ukvi", "toefl_ibt", "toefl_ibt_home", "pte_academic", "duolingo", "cambridge_c1_c2"]);
export const isEnglishExam = (exam: string) => ENGLISH_EXAMS.has(exam);

/** Countries where English is the majority first language; residents there are not asked about English tests. */
export const ENGLISH_SPEAKING = new Set(["GB", "IE", "US", "CA", "AU", "NZ"]);

export const EXAM_NAMES: Record<string, string> = {
  ielts_academic: "IELTS Academic",
  ielts_ukvi: "IELTS UKVI",
  toefl_ibt: "TOEFL iBT",
  toefl_ibt_home: "TOEFL iBT Home",
  pte_academic: "PTE Academic",
  duolingo: "Duolingo English Test",
  cambridge_c1_c2: "Cambridge C1/C2",
  testdaf: "TestDaF",
  dsh: "DSH",
  goethe: "Goethe",
  delf_dalf: "DELF/DALF",
  tcf: "TCF",
  gre: "GRE",
  gmat: "GMAT",
  sat: "SAT",
  act: "ACT",
};

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) => {
  try {
    return COUNTRY_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
};

export const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** True when a departure task for this application is ticked. */
export const departureDone = (ctx: { input: { departureTasks: { applicationId: string; taskKey: string }[] } }, appId: string, key: string) =>
  ctx.input.departureTasks.some((t) => t.applicationId === appId && t.taskKey === key);
