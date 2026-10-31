import { appSubjects, courseLabel, daysBetween } from "./helpers";
import type { Ctx, StepDef, Subject } from "./types";

const course = (_: Ctx, s: Subject) => ({ course: courseLabel(s.app!) });

/** Stage 5: Submit and wait (spec section 5). */
export const STAGE5: StepDef[] = [
  {
    id: "S5.01",
    stage: 5,
    dismissable: true,
    available: true,
    parentTitle: "Checking the {course} portal",
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => a.status === "submitted" && !a.decision)),
    done: (ctx, s) => s.app!.portalCheckedAt != null && daysBetween(s.app!.portalCheckedAt, ctx.today) < 10,
    href: (_, s) => `/app/tracker/${s.app!.id}#portal`,
    params: course,
  },
  {
    // A portal check that noted something missing, until the student marks it sorted (M5 J5.6, plan R9).
    id: "S5.02",
    stage: 5,
    dismissable: true,
    available: true,
    parentTitle: "Sending a missing document for {course}",
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => (a.missingNotes ?? 0) > 0 && !a.declinedAt)),
    done: () => false,
    href: (_, s) => `/app/tracker/${s.app!.id}#portal`,
    params: course,
  },
  {
    // An interview the student logged, until its date passes (G26, plan R8). The date is the student's, so it never
    // becomes a due date and never starts a reminder (M5 global constraints).
    id: "S5.03",
    stage: 5,
    dismissable: true,
    available: true,
    markable: true,
    parentTitle: "Preparing for an interview for {course}",
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => !a.decision && (a.interviews ?? []).some((t) => t.slice(0, 10) >= ctx.today))),
    done: () => false,
    href: (_, s) => `/app/tracker/${s.app!.id}#interviews`,
    params: course,
  },
  {
    // The student's own expected decision date has passed with no decision recorded (G26, plan R8).
    id: "S5.04",
    stage: 5,
    dismissable: true,
    available: true,
    subjects: (ctx) =>
      appSubjects(ctx.apps.filter((a) => a.status === "submitted" && !a.decision && a.expectedDecisionOn != null && a.expectedDecisionOn < ctx.today)),
    done: () => false,
    href: (_, s) => `/app/tracker/${s.app!.id}#decision`,
    params: course,
  },
  {
    // The waitlist guide and continued-interest letter are on the application's decision section (plan R8).
    id: "S5.05",
    stage: 5,
    dismissable: true,
    available: true,
    markable: true,
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => a.decision === "waitlisted")),
    done: (_, s) => s.app!.documents.some((d) => d.kind === "continued_interest" && d.versions > 0),
    href: (_, s) => `/app/tracker/${s.app!.id}#decision`,
    params: course,
  },
  {
    // The "no offers yet" path (G20, G21, M5 J5.4). Planning the next intake sets intakeRolledAt, after which these
    // rejections no longer count, so the step goes and the student is back in stage 2 or 3.
    id: "S5.06",
    stage: 5,
    dismissable: true,
    available: true,
    markable: true,
    parentTitle: "Planning for the next intake",
    applies: (ctx) => ctx.apps.length > 0 && ctx.apps.every((a) => a.decision === "rejected"),
    done: () => false,
    href: () => "/app/next-intake",
  },
];
