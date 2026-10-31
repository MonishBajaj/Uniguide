import type { ApplicationSnapshot, CountryRuleRow } from "../types";
import { addDays, countryName, courseLabel, departureDone, ref } from "./helpers";
import type { Ctx, StepDef, Subject } from "./types";

const acceptedApps = (ctx: Ctx) => ctx.apps.filter((a) => a.offerAcceptedAt);

/** Verified rules of one kind for the accepted course's destination that apply to the student. */
function verifiedRules(ctx: Ctx, app: ApplicationSnapshot, kind: string) {
  return ctx.input.countryRules.filter(
    (r) =>
      r.kind === kind &&
      r.status === "verified" &&
      r.destination === app.program.country &&
      (r.appliesTo.length === 0 || r.appliesTo.includes(ctx.input.profile.residenceCountry)),
  );
}

/** One step per verified rule of `kind`, done when its pre-departure task (`rule:<id>`, 10.1) is ticked. */
function ruleStep(id: string, kind: string, href: string, parentTitle: string): StepDef {
  return {
    id,
    stage: 7,
    dismissable: true,
    available: true,
    parentTitle,
    subjects: (ctx) =>
      acceptedApps(ctx).flatMap((app) => verifiedRules(ctx, app, kind).map((rule) => ({ key: `${app.id}:${rule.id}`, app, rule }))),
    done: (ctx, s) => departureDone(ctx, s.app!.id, `rule:${s.rule!.id}`),
    dueAt: (_, s) => ruleDue(s.app!, s.rule!),
    factRefs: (_, s) => ref("country_rules", s.rule!.id, s.rule!.status),
    href: () => href,
    params: (_, s: Subject) => ({ destination: countryName(s.rule!.destination) }),
  };
}

/** The course start minus the rule's verified lead time (G23); without both, no due date. */
function ruleDue(app: ApplicationSnapshot, rule: CountryRuleRow): string | null {
  const start = app.cycle?.startsOn;
  return start && rule.status === "verified" && rule.leadDays ? addDays(start, -rule.leadDays) : null;
}

/** Stage 7: Go (spec section 5). */
export const STAGE7: StepDef[] = [
  {
    // Done when the destination's visa rule task is ticked; with no published visa rule the student marks it done.
    // Waits for the admission document the visa needs (S6.08, M5 plan R3).
    id: "S7.01",
    stage: 7,
    dismissable: true,
    available: true,
    markable: true,
    parentTitle: "Applying for the student visa",
    subjects: (ctx) => acceptedApps(ctx).filter((a) => a.admissionDocumentAt).map((app) => ({ key: app.id, app })),
    done: (ctx, s) =>
      ctx.input.countryRules.some(
        (r) => r.kind === "visa_info" && r.destination === s.app!.program.country && departureDone(ctx, s.app!.id, `rule:${r.id}`),
      ),
    href: () => "/visas",
  },
  ruleStep("S7.02", "proof_of_funds", "/visas/funds", "Preparing proof of funds"),
  {
    // When the institution publishes housing facts (7.3) or the destination has a verified housing rule (G23).
    // Done with the departure timeline's housing task, or the housing rule's own task.
    id: "S7.03",
    stage: 7,
    dismissable: true,
    available: true,
    parentTitle: "Applying for housing",
    subjects: (ctx) =>
      acceptedApps(ctx)
        .filter((app) => (app.housingFacts ?? 0) > 0 || verifiedRules(ctx, app, "housing").length > 0)
        .map((app) => ({ key: app.id, app, rule: verifiedRules(ctx, app, "housing")[0] })),
    done: (ctx, s) => departureDone(ctx, s.app!.id, "accommodation") || (s.rule != null && departureDone(ctx, s.app!.id, `rule:${s.rule.id}`)),
    dueAt: (_, s) => (s.rule ? ruleDue(s.app!, s.rule) : null),
    factRefs: (_, s) => (s.rule ? ref("country_rules", s.rule.id, s.rule.status) : []),
    href: () => "/app/departure",
  },
  ruleStep("S7.04", "health_insurance", "/app/departure", "Arranging health insurance"),
  ruleStep("S7.05", "credential_evaluation", "/visas", "Getting qualifications evaluated"),
  ruleStep("S7.06", "banking", "/visas", "Setting up money and banking"),
  {
    // From 30 days before the published start date; done with the "Book your travel" task.
    id: "S7.07",
    stage: 7,
    dismissable: true,
    available: true,
    parentTitle: "Planning the arrival",
    subjects: (ctx) => acceptedApps(ctx).map((app) => ({ key: app.id, app })),
    // Own applications have no published start date or arrival page, so the step can't apply to them.
    applies: (ctx, s) => s.app!.program.slug != null && s.app!.cycle?.startsOn != null && ctx.today >= addDays(s.app!.cycle.startsOn, -30),
    done: (ctx, s) => departureDone(ctx, s.app!.id, "flights"),
    dueAt: (_, s) => s.app!.cycle?.startsOn ?? null,
    href: (_, s) => `/courses/${s.app!.program.slug}/arrival`,
    params: (_, s) => ({ course: courseLabel(s.app!) }),
  },
  ruleStep("S7.08", "residence_registration", "/app/departure", "Registering after arrival"),
];
