import { formatDate } from "../copy";
import { STUDENT, appSubjects, courseLabel, daysBetween } from "./helpers";
import type { Ctx, StepDef, Subject } from "./types";

const course = (_: Ctx, s: Subject) => ({ course: courseLabel(s.app!) });
const offers = (ctx: Ctx) => ctx.apps.filter((a) => a.decision === "admitted");
const accepted = (ctx: Ctx) => ctx.apps.some((a) => a.offerAcceptedAt);
const acceptedApps = (ctx: Ctx) => ctx.apps.filter((a) => a.offerAcceptedAt);
const afterAccept = () => "/app/offers#after-accept";

/** Stage 6: Decide (spec section 5). */
export const STAGE6: StepDef[] = [
  {
    id: "S6.01",
    stage: 6,
    dismissable: true,
    available: true,
    parentTitle: "Adding the {course} offer details",
    // Only while choosing: once an offer is accepted, the others' details no longer matter.
    subjects: (ctx) => (accepted(ctx) ? [] : appSubjects(offers(ctx))),
    done: (_, s) => s.app!.awardedAid != null || s.app!.depositDueAt != null || s.app!.conditions != null,
    href: () => "/app/offers",
    params: course,
  },
  {
    id: "S6.02",
    stage: 6,
    dismissable: true,
    available: true,
    markable: true,
    parentTitle: "Comparing the true cost of the offers",
    subjects: (ctx) => (offers(ctx).length >= 2 ? STUDENT : []),
    done: accepted,
    href: () => "/app/offers#cost",
  },
  {
    id: "S6.03",
    stage: 6,
    dismissable: true,
    available: true,
    parentTitle: "Weighing up the offers",
    subjects: (ctx) => (offers(ctx).length >= 2 ? STUDENT : []),
    done: (ctx) => ctx.input.decisionMatrixSaved || accepted(ctx),
    href: () => "/app/offers#matrix",
  },
  {
    // The reply date is the student's own entry (7.7), so quoting it needs no fact reference.
    id: "S6.04",
    stage: 6,
    dismissable: false,
    available: true,
    parentTitle: "Replying to the {course} offer by {date}",
    subjects: (ctx) => appSubjects(offers(ctx).filter((a) => a.depositDueAt)),
    applies: (ctx, s) => accepted(ctx) || daysBetween(ctx.today, s.app!.depositDueAt!) <= 21,
    done: accepted,
    dueAt: (_, s) => s.app!.depositDueAt,
    href: () => "/app/offers#decision-day",
    params: (_, s) => ({ course: courseLabel(s.app!), date: formatDate(s.app!.depositDueAt!) }),
  },
  {
    // The conditions are the student's words and often mention grades, so no parent title (spec 3.5).
    id: "S6.05",
    stage: 6,
    dismissable: true,
    available: true,
    subjects: (ctx) => appSubjects(acceptedApps(ctx).filter((a) => a.conditions)),
    done: (_, s) => s.app!.conditions?.metAt != null,
    href: afterAccept,
    params: course,
  },
  {
    // A deposit is due when the student noted a reply date or the course publishes a deposit deadline.
    id: "S6.06",
    stage: 6,
    dismissable: true,
    available: true,
    parentTitle: "Paying the deposit",
    subjects: (ctx) => appSubjects(acceptedApps(ctx).filter((a) => a.depositDueAt || a.hasDepositDeadline)),
    done: (_, s) => s.app!.depositPaidAt != null,
    dueAt: (_, s) => s.app!.depositDueAt ?? null,
    href: afterAccept,
    params: course,
  },
  {
    // Once one offer is accepted, each other offer or waitlist place still open, until the student declines it
    // (G14). Read from every application, since a declined one no longer counts anywhere else.
    id: "S6.07",
    stage: 6,
    dismissable: true,
    available: true,
    parentTitle: "Letting the other universities know",
    subjects: (ctx) =>
      accepted(ctx)
        ? appSubjects(
            ctx.input.applications.filter(
              (a) => !a.offerAcceptedAt && (a.decision === "admitted" || a.decision === "waitlisted") && a.status !== "withdrawn",
            ),
          )
        : [],
    done: (_, s) => s.app!.declinedAt != null,
    href: () => "/app/offers#others",
    params: course,
  },
  {
    // Every destination needs some admission document for a student visa (M5 plan R2); the help names examples.
    id: "S6.08",
    stage: 6,
    dismissable: true,
    available: true,
    parentTitle: "Getting the admission document for the visa",
    subjects: (ctx) => appSubjects(acceptedApps(ctx)),
    done: (_, s) => s.app!.admissionDocumentAt != null,
    href: afterAccept,
    params: course,
  },
  {
    // Declining research sharing leaves no record (plan D10), so the step stays until shared or dismissed.
    id: "S6.09",
    stage: 6,
    dismissable: true,
    available: true,
    subjects: (ctx) => appSubjects(ctx.apps.filter((a) => a.decision && a.decision !== "withdrawn" && a.decision !== "deferred")),
    done: (_, s) => s.app!.outcomeShared,
    href: (_, s) => `/app/tracker/${s.app!.id}#decision`,
    params: course,
  },
];
