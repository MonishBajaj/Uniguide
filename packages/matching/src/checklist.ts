import type { DeadlineFact, RequirementFact } from "./types";

export interface ChecklistDeadline extends DeadlineFact {
  round?: string | null;
  owningSystem: string;
}

const NOT_APPLICATION_TASKS = new Set(["visa_step", "post_study_work", "work_hours"]);

export interface CountryRule {
  id: string;
  kind: string;
  title: string;
  details?: string | null;
  link?: string | null;
  // Fields below come from the typed country_rules columns; the checklist does not need them.
  destination?: string;
  appliesTo?: string[];
  status?: "verified" | "unverified" | "conflicting" | "unknown";
  amount?: number | null;
  currency?: string | null;
  period?: "per_month" | "per_year" | "total" | null;
  months?: number | null;
  hoursPerWeek?: number | null;
  region?: string | null;
  step?: number | null;
  evidenceQuote?: string | null;
  verifiedAt?: string | null;
}

export interface ChecklistItem {
  kind: "requirement" | "system_step" | "deadline";
  title: string;
  details?: string;
  link?: string;
  dueAt: string | null;
  requirementId?: string;
  deadlineId?: string;
  sort: number;
}

const EXAM: Record<string, string> = {
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

/** Steps each central application system adds, with its official site. Process, not facts with dates. */
const SYSTEM_STEPS: Record<string, { title: string; link: string }[]> = {
  ucas: [
    { title: "Register on UCAS and add this course to your choices", link: "https://www.ucas.com/" },
    { title: "Get your UCAS reference from your school or referee", link: "https://www.ucas.com/" },
  ],
  uni_assist: [
    { title: "Create a uni-assist account and upload certified documents", link: "https://www.uni-assist.de/en/" },
    { title: "Pay the uni-assist handling fee so your application is checked in time", link: "https://www.uni-assist.de/en/" },
  ],
  common_app: [
    { title: "Add this college on the Common App and complete its questions", link: "https://www.commonapp.org/" },
    { title: "Ask your counselor and teachers to submit recommendations", link: "https://www.commonapp.org/" },
  ],
  ouac: [{ title: "Apply through OUAC and note your OUAC reference number", link: "https://www.ouac.on.ca/" }],
  cao: [{ title: "Register with the CAO and list this course", link: "https://www.cao.ie/" }],
  uac: [{ title: "Apply through UAC and list this course", link: "https://www.uac.edu.au/" }],
};

const isApplication = (d: DeadlineFact) => d.kind === "application" || d.kind === "priority";

/**
 * Checklist for one application, seeded from the course's published requirements and deadlines
 * plus the steps of the system that owns the application. Every requirement-derived item keeps
 * the requirement id, so the card can show its source and verification status.
 */
export function buildChecklist(
  requirements: RequirementFact[],
  deadlines: ChecklistDeadline[],
  applicantCategories: string[],
  now: Date,
  qualificationLabel: (code: string) => string = (code) => code.replaceAll("_", " "),
  countryRules: CountryRule[] = [],
): ChecklistItem[] {
  const reqs = requirements.filter((r) => applicantCategories.includes(r.applicantCategory));
  const open = deadlines
    .filter((d) => applicantCategories.includes(d.applicantCategory) && new Date(d.dueAt) >= now)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const main = open.find(isApplication) ?? null;
  const due = main?.dueAt ?? null;
  // Steps due "by the application deadline" point at it, so they display in its time zone.
  const mainId = main?.id;
  const items: ChecklistItem[] = [];
  let sort = 0;
  const push = (item: Omit<ChecklistItem, "sort">) => items.push({ ...item, sort: sort++ });

  for (const s of SYSTEM_STEPS[main?.owningSystem ?? ""] ?? []) {
    push({ kind: "system_step", title: s.title, link: s.link, dueAt: due, deadlineId: mainId });
  }

  // Steps that depend on where the student comes from (e.g. APS for Germany), before anything else.
  // Visa-stage and informational rules (steps after an offer, work rights, regional funds) are not application tasks.
  const applicationRules = countryRules.filter(
    (r) => r.kind !== "visa_info" && !NOT_APPLICATION_TASKS.has(r.kind) && !(r.kind === "proof_of_funds" && r.region),
  );
  for (const rule of applicationRules) {
    push({ kind: "system_step", title: rule.title, details: rule.details ?? undefined, link: rule.link ?? undefined, dueAt: due, deadlineId: mainId });
  }

  const entry = reqs.filter((r) => r.kind === "entry_qualification");
  if (entry.length) {
    push({
      kind: "requirement",
      title: "Get your transcript and qualification certificate",
      details: entry
        .map((r) => [r.qualification ? qualificationLabel(r.qualification) : null, r.minGradeText].filter(Boolean).join(": "))
        .join("; "),
      dueAt: due,
      deadlineId: mainId,
      requirementId: entry[0]!.id,
    });
  }

  const language = reqs.filter((r) => r.kind === "language_test");
  if (language.length) {
    push({
      kind: "requirement",
      title: language.length > 1 ? "Send one accepted English test score" : `Send your ${EXAM[language[0]!.exam ?? ""] ?? "language test"} score`,
      details: language
        .map((r) => `${EXAM[r.exam ?? ""] ?? r.exam}${r.minTotal != null ? ` ${r.minTotal}` : ""}`)
        .join(", "),
      dueAt: due,
      deadlineId: mainId,
      requirementId: language[0]!.id,
    });
  }

  for (const r of reqs.filter((r) => r.kind === "admissions_test" && r.testPolicy === "required")) {
    push({
      kind: "requirement",
      title: `Send official ${EXAM[r.exam ?? ""] ?? "test"} scores`,
      details: r.minTotal != null ? `Minimum ${r.minTotal}` : undefined,
      dueAt: due,
      deadlineId: mainId,
      requirementId: r.id,
    });
  }

  const titles: Partial<Record<RequirementFact["kind"], (r: RequirementFact) => string>> = {
    recommendation_letters: (r) => `Ask ${r.countRequired ?? "your"} referees for recommendation letters`,
    statement: (r) =>
      `Write your statement of purpose or personal statement${r.wordLimit ? ` (up to ${r.wordLimit} words)` : ""}`,
    portfolio: () => "Prepare your portfolio",
    interview: () => "Prepare for the interview",
    prerequisite: () => "Check the prerequisite courses against your transcript",
  };
  for (const r of reqs) {
    const title = titles[r.kind];
    if (title) push({ kind: "requirement", title: title(r), dueAt: due, deadlineId: mainId, requirementId: r.id });
  }

  for (const d of open) {
    push({
      kind: "deadline",
      title: `${d.kind === "application" ? "Submit the application" : `${d.kind[0]!.toUpperCase()}${d.kind.slice(1)} deadline`}${d.round ? ` (${d.round})` : ""}`,
      dueAt: d.dueAt,
      deadlineId: d.id,
    });
  }
  return items;
}
