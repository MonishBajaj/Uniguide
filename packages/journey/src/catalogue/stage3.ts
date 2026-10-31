import { formatDate } from "../copy";
import { appSubjects, courseLabel, daysBetween, known, nextDeadline, ref } from "./helpers";
import type { Ctx, StepDef } from "./types";

/** The tracked-but-not-started application whose next deadline is soonest. */
function nearestShortlisted(ctx: Ctx) {
  return ctx.apps
    .filter((a) => a.status === "shortlisted")
    .map((app) => ({ app, deadline: nextDeadline(app, ctx.today) }))
    .filter((x) => x.deadline)
    .sort((a, b) => a.deadline!.dueAt.localeCompare(b.deadline!.dueAt))[0];
}

/** The first shortlisted course that publishes an entry or English test minimum the comparison panel can use. */
const withMinimums = (ctx: Ctx) =>
  ctx.apps.find((a) => a.status === "shortlisted" && a.requirements.some((r) => known(r) && (r.kind === "entry_qualification" || r.kind === "language_test")));

const started = (ctx: Ctx) => ctx.apps.some((a) => a.status !== "shortlisted");

/** Stage 3: Shortlist (spec section 5). */
export const STAGE3: StepDef[] = [
  {
    // Advises 6 to 10 courses, never requires it (spec open question); imbalance warnings stay on the panel (M3 P4).
    id: "S3.01",
    stage: 3,
    dismissable: true,
    until: 3,
    available: true,
    markable: true,
    applies: (ctx) => ctx.input.shortlist.length < 6,
    done: () => false,
    href: () => "/app/shortlist#advice",
  },
  {
    id: "S3.02",
    stage: 3,
    dismissable: true,
    until: 3,
    available: true,
    markable: true,
    applies: (ctx) => withMinimums(ctx) !== undefined,
    done: () => false,
    href: () => "/app/shortlist#comparison",
    params: (ctx) => ({ course: courseLabel(withMinimums(ctx)!) }),
  },
  {
    id: "S3.03",
    stage: 3,
    dismissable: true,
    until: 3,
    available: true,
    markable: true,
    applies: (ctx) => ctx.input.profile.budgetAmount != null && ctx.apps.some((a) => a.status === "shortlisted"),
    done: () => false,
    href: () => "/app/shortlist#costs",
  },
  {
    // A shortlisted course with more than one intake still open, until the student picks one (M5 J5.7, plan R10).
    // A course already being prepared keeps its intake, so it never asks.
    id: "S3.04",
    stage: 3,
    dismissable: true,
    available: true,
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => a.status === "shortlisted" && (a.openCycles ?? 0) > 1)),
    done: (_, s) => s.app!.intakeChosen === true,
    href: () => "/app/shortlist",
    params: (_, s) => ({ course: courseLabel(s.app!) }),
  },
  {
    // Can't be dismissed while nothing is being prepared and a deadline is within 10 weeks.
    id: "S3.05",
    stage: 3,
    dismissable: false,
    available: true,
    parentTitle: "Deciding where to apply",
    subjects: (ctx) => {
      const near = nearestShortlisted(ctx);
      return near && daysBetween(ctx.today, near.deadline!.dueAt) <= 70 ? [{ key: null, app: near.app }] : [];
    },
    done: started,
    dueAt: (ctx, s) => nextDeadline(s.app!, ctx.today)!.dueAt,
    factRefs: (ctx, s) => {
      const d = nextDeadline(s.app!, ctx.today)!;
      return ref("deadlines", d.id, d.status);
    },
    // The "I'm applying to this" button on the application page (J3.2).
    href: (_, s) => `/app/tracker/${s.app!.id}#applying`,
    copyKey: (ctx, s) => (nextDeadline(s.app!, ctx.today)!.status === "verified" ? "S3.05" : "S3.05.check"),
    params: (ctx, s) => {
      const d = nextDeadline(s.app!, ctx.today)!;
      return { course: courseLabel(s.app!), date: formatDate(d.dueAt, d.timezone) };
    },
  },
  {
    // "Parent opened" needs view tracking (plan D8).
    id: "S3.06",
    stage: 3,
    dismissable: true,
    available: false,
    done: () => false,
    href: () => "/app/sharing",
  },
];
