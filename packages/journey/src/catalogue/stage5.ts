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
    // Portal notes have no "missing" or "resolved" state yet (plan D9).
    id: "S5.02",
    stage: 5,
    dismissable: true,
    available: false,
    done: () => false,
    href: () => "/app/tracker",
  },
  {
    // Waits for interview events (G26).
    id: "S5.03",
    stage: 5,
    dismissable: true,
    available: false,
    done: () => false,
    href: () => "/app/tracker",
  },
  {
    // Waits for expected decision dates (G26).
    id: "S5.04",
    stage: 5,
    dismissable: true,
    available: false,
    done: () => false,
    href: () => "/app/tracker",
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
    // A new track for the next intake is the nearest thing to G20's "no offers" path that exists.
    id: "S5.06",
    stage: 5,
    dismissable: true,
    available: true,
    markable: true,
    parentTitle: "Planning for the next intake",
    applies: (ctx) => ctx.apps.length > 0 && ctx.apps.every((a) => a.decision === "rejected"),
    done: () => false,
    href: () => "/app/profile#tracks",
  },
];
