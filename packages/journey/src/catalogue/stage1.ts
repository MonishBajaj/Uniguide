import { checklistFields } from "../minimum";
import { STUDENT, checkSuffix, courseLabel, ref, testRequirements } from "./helpers";
import type { Ctx, StepDef } from "./types";

const targetsSet = (ctx: Ctx) => {
  const f = checklistFields(ctx.input.profile, ctx.input.tracks);
  return f.target_levels.length > 0 && f.target_fields.length > 0 && f.target_countries.length > 0;
};

/** Doctorate matching also needs research interests (the profile checklist's last item). */
const researchMissing = (ctx: Ctx) => ctx.variants.includes("research") && !ctx.input.profile.researchInterests?.trim();

/** Stage 1: Set up (spec section 5). */
export const STAGE1: StepDef[] = [
  {
    id: "S1.01",
    stage: 1,
    dismissable: true,
    available: true,
    parentTitle: "Choosing what and where to study",
    done: (ctx) => targetsSet(ctx) && !researchMissing(ctx),
    // The short profile (onboarding screen 3) skips the entry question and offers the chat when AI consent exists.
    href: (ctx) => (targetsSet(ctx) && researchMissing(ctx) ? "/app/profile#research" : "/app/onboarding?screen=3"),
    copyKey: (ctx) => (targetsSet(ctx) && researchMissing(ctx) ? "S1.01.research" : "S1.01"),
  },
  {
    id: "S1.02",
    stage: 1,
    dismissable: true,
    available: true,
    parentTitle: "Setting a budget",
    done: (ctx) => Boolean(ctx.input.profile.budgetAmount && ctx.input.profile.budgetCurrency),
    href: () => "/app/profile#budget",
  },
  {
    // The profile's #intake field arrived with M2 (J2.1), so this is on.
    id: "S1.03",
    stage: 1,
    dismissable: true,
    available: true,
    parentTitle: "Choosing when to start",
    done: (ctx) => ctx.input.profile.intakeYear != null,
    href: () => "/app/profile#intake",
  },
  {
    id: "S1.04",
    stage: 1,
    dismissable: true,
    available: true,
    done: (ctx) => {
      const p = ctx.input.profile;
      return Boolean(p.homeQualification && (p.gradeValue != null || p.gradeText) && p.gradeScale);
    },
    href: () => "/app/profile#qualification",
  },
  {
    // Only when a course the student tracks asks for a test (plan D4). "Not taken yet" waits for G11.
    id: "S1.05",
    stage: 1,
    dismissable: true,
    available: true,
    subjects: (ctx) => {
      const app = ctx.apps.find((a) => testRequirements(a).length > 0);
      return app ? [{ key: null, app }] : [];
    },
    done: (ctx) => ctx.input.testScores.length > 0,
    factRefs: (_, s) => testRequirements(s.app!).flatMap((r) => ref("requirements", r.id, r.status)),
    href: () => "/app/profile#scores-section",
    copyKey: (_, s) => `S1.05${checkSuffix(testRequirements(s.app!))}`,
    params: (_, s) => ({ course: courseLabel(s.app!) }),
  },
  {
    id: "S1.06",
    stage: 1,
    dismissable: false,
    available: true,
    // Pending consent only (M1 D3): /consent can't help a student whose consent was revoked (M2 N17).
    applies: (ctx) => ctx.input.profile.consentState === "pending_parental" || ctx.input.profile.consentState === "granted",
    done: (ctx) => ctx.input.profile.consentState === "granted",
    href: () => "/consent",
  },
  {
    // Undergraduates are usually younger and family-funded; anyone else once they reach the budget.
    id: "S1.07",
    stage: 1,
    dismissable: true,
    available: true,
    applies: (ctx) => ctx.variants.includes("undergraduate") || targetsSet(ctx),
    done: (ctx) => ctx.input.parentLinked,
    href: () => "/app/sharing#family",
  },
  {
    id: "S1.08",
    stage: 1,
    variants: ["masters", "research"],
    dismissable: true,
    until: 2,
    available: true,
    subjects: () => STUDENT,
    done: (ctx) => ctx.input.profile.gradeValue != null || Boolean(ctx.input.profile.gradeText),
    href: () => "/app/profile#cv",
  },
];
