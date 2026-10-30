import { formatDate } from "../copy";
import { courseLabel, daysBetween, nextDeadline, ref } from "./helpers";
import type { Ctx, StepDef } from "./types";

/** The tracked-but-not-started application whose next deadline is soonest. */
function nearestShortlisted(ctx: Ctx) {
  return ctx.apps
    .filter((a) => a.status === "shortlisted")
    .map((app) => ({ app, deadline: nextDeadline(app, ctx.today) }))
    .filter((x) => x.deadline)
    .sort((a, b) => a.deadline!.dueAt.localeCompare(b.deadline!.dueAt))[0];
}

const started = (ctx: Ctx) => ctx.apps.some((a) => a.status !== "shortlisted");

/** Stage 3: Shortlist (spec section 5). */
export const STAGE3: StepDef[] = [
  {
    // Waits for the shortlist advice panel on /app/shortlist (G8, M3).
    id: "S3.01",
    stage: 3,
    dismissable: true,
    available: false,
    done: () => false,
    href: () => "/app/shortlist",
  },
  {
    // Waits for the profile comparison panel (G8, M3).
    id: "S3.02",
    stage: 3,
    dismissable: true,
    available: false,
    markable: true,
    done: () => false,
    href: () => "/app/shortlist",
  },
  {
    // Waits for cost scenarios on the shortlist (plan R10).
    id: "S3.03",
    stage: 3,
    dismissable: true,
    available: false,
    markable: true,
    done: () => false,
    href: () => "/app/shortlist",
  },
  {
    // Shortlist rows have no cycle yet (plan D11).
    id: "S3.04",
    stage: 3,
    dismissable: true,
    available: false,
    done: () => false,
    href: () => "/app/shortlist",
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
    href: (_, s) => `/app/tracker/${s.app!.id}`,
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
