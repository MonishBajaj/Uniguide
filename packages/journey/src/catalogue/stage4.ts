import type { ApplicationSnapshot, CountryRuleRow } from "../types";
import {
  EXAM_NAMES,
  appSubjects,
  checkSuffix,
  countryName,
  courseLabel,
  deadlineRefs,
  nextDeadline,
  ref,
  requirementsOf,
  testRequirements,
} from "./helpers";
import type { Ctx, StepDef, Subject } from "./types";

const preparing = (ctx: Ctx) => ctx.apps.filter((a) => a.status === "preparing");

/** The earliest known course start among the student's applications, else 1 September of their intake year. */
const intakeStart = (ctx: Ctx): string =>
  ctx.apps
    .map((a) => a.cycle?.startsOn)
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? `${ctx.input.profile.intakeYear ?? ctx.today.slice(0, 4)}-09-01`;

const addMonths = (date: string, months: number): string => {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const course = (_: Ctx, s: Subject) => ({ course: courseLabel(s.app!) });
/** The next published deadline, or for an own application the student's own date (ranking only, never a fact). */
const due = (ctx: Ctx, s: Subject) =>
  nextDeadline(s.app!, ctx.today)?.dueAt ?? (s.app!.ownDueAt && s.app!.ownDueAt.slice(0, 10) >= ctx.today ? s.app!.ownDueAt : null);
const tracker = (s: Subject, anchor = "") => `/app/tracker/${s.app!.id}${anchor}`;

/** Rule kinds that are tasks after an offer or just information, never application steps (as in matching's checklist). */
const NOT_APPLICATION_RULES = new Set(["visa_info", "visa_step", "post_study_work", "work_hours", "proof_of_funds", "banking"]);

/** Country rules that apply to this student's residence for this application's destination. */
function applicationRules(ctx: Ctx, app: ApplicationSnapshot): CountryRuleRow[] {
  return ctx.input.countryRules.filter(
    (r) =>
      r.status !== "unknown" &&
      r.destination === app.program.country &&
      !NOT_APPLICATION_RULES.has(r.kind) &&
      (r.appliesTo.length === 0 || r.appliesTo.includes(ctx.input.profile.residenceCountry)),
  );
}

/** The checklist item a rule created: by rule id, or by link for items made before rule ids were stored (plan D7). */
const ruleItem = (app: ApplicationSnapshot, rule: CountryRuleRow) =>
  app.checklist.find((i) => i.countryRuleId === rule.id) ??
  app.checklist.find((i) => i.countryRuleId == null && i.kind === "system_step" && rule.link != null && i.link === rule.link);

const STATEMENT_KINDS = new Set(["statement_of_purpose", "personal_statement"]);
const asked = (s: Subject) => s.app!.letters.filter((l) => l.status === "asked" || l.status === "agreed" || l.status === "submitted").length;
const lettersNeeded = (s: Subject) => s.requirement!.countRequired ?? 1;

/** Stage 4: Prepare (spec section 5). Every step here is per application and carries its label. */
export const STAGE4: StepDef[] = [
  {
    id: "S4.01",
    stage: 4,
    dismissable: true,
    available: true,
    parentTitle: "Working through the {course} checklist",
    subjects: (ctx) => appSubjects(preparing(ctx)),
    applies: (_, s) => s.app!.checklist.length > 0,
    done: (_, s) => s.app!.checklist.every((i) => i.done),
    dueAt: (ctx, s) =>
      s.app!.checklist
        .filter((i) => !i.done && i.dueAt)
        .map((i) => i.dueAt!)
        .sort()[0] ?? due(ctx, s),
    factRefs: (ctx, s) => deadlineRefs(s.app!, ctx.today),
    href: (_, s) => tracker(s, "#checklist"),
    params: (_, s) => {
      const open = s.app!.checklist.filter((i) => !i.done).length;
      return { course: courseLabel(s.app!), count: String(open), items: open === 1 ? "item" : "items" };
    },
  },
  {
    // Verified rules only. Any other rule becomes S4.02-check below (spec 5, stage 4 acceptance).
    id: "S4.02",
    stage: 4,
    dismissable: true,
    available: true,
    parentTitle: "Starting the {rule}",
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) =>
        applicationRules(ctx, app)
          .filter((r) => r.status === "verified")
          .map((rule) => ({ key: `${app.id}:${rule.id}`, app, rule })),
      ),
    done: (_, s) => ruleItem(s.app!, s.rule!)?.done ?? false,
    dueAt: (ctx, s) => ruleItem(s.app!, s.rule!)?.dueAt ?? due(ctx, s),
    factRefs: (_, s) => ref("country_rules", s.rule!.id, s.rule!.status),
    href: (_, s) => tracker(s, "#checklist"),
    params: (ctx, s) => ({
      rule: s.rule!.title,
      residence: countryName(ctx.input.profile.residenceCountry),
      destination: countryName(s.rule!.destination),
    }),
  },
  {
    // An unverified or conflicting rule never says "you need": the student checks it with the university.
    id: "S4.02-check",
    stage: 4,
    dismissable: true,
    available: true,
    markable: true,
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) =>
        applicationRules(ctx, app)
          .filter((r) => r.status !== "verified")
          .map((rule) => ({ key: `${app.id}:${rule.id}`, app, rule })),
      ),
    done: (_, s) => ruleItem(s.app!, s.rule!)?.done ?? false,
    factRefs: (_, s) => ref("country_rules", s.rule!.id, s.rule!.status),
    href: (_, s) => tracker(s, "#checklist"),
    params: (_, s) => ({ rule: s.rule!.title }),
  },
  {
    id: "S4.03",
    stage: 4,
    dismissable: true,
    available: true,
    leadDays: 21,
    parentTitle: "Asking for recommendation letters",
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) => {
        const requirement = requirementsOf(app, "recommendation_letters")[0];
        return requirement ? [{ key: app.id, app, requirement, letter: app.letters.find((l) => l.status === "not_asked") }] : [];
      }),
    done: (_, s) => asked(s) >= lettersNeeded(s),
    dueAt: due,
    factRefs: (_, s) => ref("requirements", s.requirement!.id, s.requirement!.status),
    href: () => "/app/recommenders",
    copyKey: (_, s) => (s.requirement!.status !== "verified" ? "S4.03.check" : s.letter ? "S4.03" : "S4.03.none"),
    params: (_, s) => ({
      course: courseLabel(s.app!),
      recommender: s.letter?.recommenderName ?? "",
      count: String(lettersNeeded(s)),
    }),
  },
  {
    // One per recommender who agreed; "opened" can't be seen, so the student marks it done (D8).
    id: "S4.04",
    stage: 4,
    dismissable: true,
    available: true,
    markable: true,
    subjects: (ctx) => {
      const seen = new Map<string, Subject>();
      for (const app of preparing(ctx))
        for (const l of app.letters)
          if (l.status === "agreed" && !seen.has(l.recommenderId))
            seen.set(l.recommenderId, { key: l.recommenderId, app, recommender: { id: l.recommenderId, name: l.recommenderName } });
      return [...seen.values()];
    },
    done: () => false,
    href: (_, s) => `/app/recommenders/${s.recommender!.id}/brag-sheet`,
    params: (_, s) => ({ recommender: s.recommender!.name }),
  },
  {
    // Linked statements start from buttons on the application page (plan R6).
    id: "S4.05",
    stage: 4,
    dismissable: true,
    available: true,
    leadDays: 21,
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) => {
        const reqs = requirementsOf(app, "statement");
        return reqs.length ? [{ key: app.id, app, requirement: reqs[0] }] : [];
      }),
    done: (_, s) => s.app!.documents.some((d) => STATEMENT_KINDS.has(d.kind)),
    dueAt: due,
    factRefs: (_, s) => ref("requirements", s.requirement!.id, s.requirement!.status),
    href: (_, s) => tracker(s),
    copyKey: (_, s) => `S4.05${checkSuffix([s.requirement!])}`,
    params: course,
  },
  {
    id: "S4.06",
    stage: 4,
    dismissable: true,
    available: true,
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) => app.documents.filter((d) => d.versions > 0).map((doc) => ({ key: doc.id, app, doc }))),
    done: (_, s) => s.doc!.reviews > 0,
    href: (_, s) => `/app/writing/${s.doc!.id}`,
    params: (_, s) => ({ document: s.doc!.question ? "your answer" : "your draft" }),
  },
  {
    id: "S4.07",
    stage: 4,
    dismissable: true,
    available: true,
    subjects: (ctx) => appSubjects(preparing(ctx)),
    applies: (_, s) => s.app!.documents.some((d) => d.kind === "supplemental"),
    done: (_, s) => s.app!.documents.filter((d) => d.kind === "supplemental").every((d) => d.versions > 0),
    dueAt: due,
    href: (_, s) => tracker(s, "#supplemental"),
    params: (_, s) => ({
      course: courseLabel(s.app!),
      count: String(s.app!.documents.filter((d) => d.kind === "supplemental" && d.versions === 0).length),
    }),
  },
  {
    id: "S4.08",
    stage: 4,
    variants: ["research"],
    dismissable: true,
    available: true,
    subjects: (ctx) => appSubjects(preparing(ctx).filter((a) => a.program.level === "doctorate")),
    done: (_, s) => s.app!.documents.some((d) => d.kind === "research_statement"),
    dueAt: due,
    href: () => "/app/writing/new",
    params: course,
  },
  {
    // A doctorate application being prepared with no supervisor contact logged against it (G9). No AI-written emails.
    id: "S4.09",
    stage: 4,
    variants: ["research"],
    dismissable: true,
    available: true,
    subjects: (ctx) => appSubjects(preparing(ctx).filter((a) => a.program.level === "doctorate")),
    done: (ctx, s) => (ctx.input.supervisorContacts ?? []).some((c) => c.applicationId === s.app!.id),
    dueAt: due,
    href: (_, s) => tracker(s, "#supervisors"),
    params: course,
  },
  {
    // No requirement kind says "CV" (plan D12), so this is advice for master's and research students.
    id: "S4.10",
    stage: 4,
    variants: ["masters", "research"],
    dismissable: true,
    until: 4,
    available: true,
    applies: (ctx) => preparing(ctx).length > 0,
    done: (ctx) => ctx.input.cvEntries > 0,
    href: () => "/app/cv",
  },
  {
    // A course being prepared asks for a test and none of its listed exams has a score or a booking (J3.4).
    // The 30-day lead time ranks it as "start soon" a month before the deadline; it is never shown.
    id: "S4.11",
    stage: 4,
    dismissable: true,
    available: true,
    leadDays: 30,
    subjects: (ctx) => appSubjects(preparing(ctx).filter((a) => testRequirements(a).length > 0)),
    done: (ctx, s) =>
      testRequirements(s.app!).some(
        (r) =>
          ctx.input.testScores.some((t) => t.exam === r.exam) ||
          ctx.input.testPlans.some((p) => p.exam === r.exam && p.status === "booked"),
      ),
    dueAt: (ctx, s) => due(ctx, s),
    factRefs: (_, s) => testRequirements(s.app!).flatMap((r) => ref("requirements", r.id, r.status)),
    href: () => "/app/profile#test-plans",
    copyKey: (_, s) => `S4.11${checkSuffix(testRequirements(s.app!))}`,
    params: (_, s) => ({ course: courseLabel(s.app!) }),
  },
  {
    // One per saved score whose exam the course lists, until it is marked sent (4.5).
    id: "S4.12",
    stage: 4,
    dismissable: true,
    available: true,
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) => {
        const exams = new Set(testRequirements(app).map((r) => r.exam).filter(Boolean));
        const saved = [...new Set(ctx.input.testScores.map((t) => t.exam))].filter((e) => exams.has(e));
        return saved.map((exam) => ({
          key: `${app.id}:${exam}`,
          app,
          exam,
          requirement: testRequirements(app).find((r) => r.exam === exam),
        }));
      }),
    done: (_, s) => s.app!.scoresSent.includes(s.exam!),
    dueAt: due,
    factRefs: (_, s) => ref("requirements", s.requirement!.id, s.requirement!.status),
    href: (_, s) => tracker(s, "#scores"),
    params: (_, s) => ({ course: courseLabel(s.app!), exam: EXAM_NAMES[s.exam!] ?? s.exam! }),
  },
  {
    // An application is in play and the passport expiry is missing or falls before the intake start plus 18 months
    // (G12). The 18 months only decides when to ask; it is never shown as a country's rule (M5 plan, Decisions 8).
    id: "S4.13",
    stage: 4,
    dismissable: true,
    available: true,
    parentTitle: "Checking the passport is valid",
    // Only while some application is still in play: a student rejected everywhere has no trip to check for.
    applies: (ctx) => ctx.apps.some((a) => a.decision !== "rejected"),
    done: (ctx) => {
      const passport = (ctx.input.readiness ?? []).find((r) => r.kind === "passport");
      return passport?.expiresOn != null && passport.expiresOn >= addMonths(intakeStart(ctx), 18);
    },
    href: () => "/app/profile#readiness",
  },
  {
    id: "S4.14",
    stage: 4,
    dismissable: true,
    available: true,
    parentTitle: "Recording the {course} application fee",
    subjects: (ctx) => appSubjects(preparing(ctx)),
    done: (_, s) => s.app!.costCount > 0,
    // The fee is paid when submitting, so it is due with the application.
    dueAt: due,
    factRefs: (ctx, s) => deadlineRefs(s.app!, ctx.today),
    href: (_, s) => tracker(s, "#costs"),
    params: course,
  },
  {
    id: "S4.15",
    stage: 4,
    dismissable: true,
    available: true,
    subjects: (ctx) =>
      preparing(ctx).flatMap((app) => {
        const reqs = requirementsOf(app, "portfolio");
        return reqs.length ? [{ key: app.id, app, requirement: reqs[0] }] : [];
      }),
    done: (ctx) => ctx.input.portfolioItems > 0,
    dueAt: due,
    factRefs: (_, s) => ref("requirements", s.requirement!.id, s.requirement!.status),
    href: () => "/app/portfolio",
    copyKey: (_, s) => `S4.15${checkSuffix([s.requirement!])}`,
    params: course,
  },
  {
    // Submitted applications count too, so submitting is recorded as a completed step.
    id: "S4.16",
    stage: 4,
    dismissable: true,
    available: true,
    parentTitle: "Submitting the {course} application",
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => a.status !== "shortlisted")),
    applies: (_, s) => s.app!.status !== "preparing" || (s.app!.checklist.length > 0 && s.app!.checklist.every((i) => i.done)),
    done: (_, s) => s.app!.status !== "preparing",
    dueAt: due,
    factRefs: (ctx, s) => deadlineRefs(s.app!, ctx.today),
    href: (_, s) => tracker(s),
    params: course,
  },
];
