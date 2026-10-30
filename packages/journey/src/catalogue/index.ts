import { fillWithin, render, TITLE_MAX } from "../copy";
import { checklistFields } from "../minimum";
import { activeApplications, computeStage } from "../stages";
import type { FactRef, JourneyInput, Level, NextStep, Stage } from "../types";
import { variantsFor } from "../variants";
import { STUDENT, courseLabel } from "./helpers";
import { STAGE1 } from "./stage1";
import { STAGE2 } from "./stage2";
import { STAGE3 } from "./stage3";
import { STAGE4 } from "./stage4";
import { STAGE5 } from "./stage5";
import { STAGE6 } from "./stage6";
import { STAGE7 } from "./stage7";
import type { Ctx, StepDef, Subject } from "./types";

export type { Ctx, StepDef, Subject } from "./types";
export { ROUTES, resolveHref } from "./routes";

/** Every step S1.01 to S7.08, in catalogue order. Ties in ranking fall back to this order. */
export const CATALOGUE: StepDef[] = [...STAGE1, ...STAGE2, ...STAGE3, ...STAGE4, ...STAGE5, ...STAGE6, ...STAGE7];

/** An open step before ranking: the ranker adds `rank` (J1.4). */
export interface Candidate extends Omit<NextStep, "rank"> {
  /** Position in CATALOGUE, for tie-breaking. */
  order: number;
  leadDays?: number;
}

export function buildCtx(input: JourneyInput, stage: Stage = computeStage(input)): Ctx {
  const fields = checklistFields(input.profile, input.tracks);
  const marked = new Set(input.stepState.filter((r) => r.state === "done").map((r) => r.stepId));
  return {
    input,
    today: input.today,
    stage,
    variants: variantsFor(fields.target_levels as Level[]),
    apps: activeApplications(input.applications),
    countries: fields.target_countries,
    marked: (id) => marked.has(id),
  };
}

const stepId = (def: StepDef, s: Subject) => (s.key ? `${def.id}:${s.key}` : def.id);

/**
 * Where a step's first quoted fact comes from: the fact's official page when the snapshot has it,
 * otherwise the course page for a course's facts, or /visas for a country rule. None without a fact.
 */
export function sourceFor(input: JourneyInput, refs: FactRef[]): { href: string } | undefined {
  const ref = refs[0];
  if (!ref) return undefined;
  if (ref.table === "country_rules") {
    const rule = input.countryRules.find((r) => r.id === ref.id);
    return { href: rule?.sourceUrl ?? "/visas" };
  }
  for (const app of input.applications) {
    const fact = ref.table === "requirements" ? app.requirements.find((r) => r.id === ref.id) : app.deadlines.find((d) => d.id === ref.id);
    if (fact) return fact.sourceUrl ? { href: fact.sourceUrl } : app.program.slug ? { href: `/courses/${app.program.slug}` } : undefined;
  }
  return undefined;
}

/**
 * Runs every available catalogue entry against the input. Steps about the student only show from
 * their stage onwards; steps about an application follow that application's own status instead.
 * Returns the open steps (unranked) and the ids of steps that apply and are done.
 */
export function evaluateCatalogue(
  input: JourneyInput,
  stage: Stage = computeStage(input),
): { open: Candidate[]; completed: string[]; marked: string[] } {
  const ctx = buildCtx(input, stage);
  const open: Candidate[] = [];
  const completed: string[] = [];
  const marked: string[] = [];
  // Without parental consent nothing personal can be saved, so the only step is getting it (spec 4.4).
  const blocked = input.profile.consentState === "pending_parental" || input.profile.consentState === "revoked";
  CATALOGUE.forEach((def, order) => {
    if (!def.available) return;
    if (def.variants && !def.variants.some((v) => ctx.variants.includes(v))) return;
    for (const s of def.subjects?.(ctx) ?? STUDENT) {
      const perApplication = s.key != null && s.app != null;
      if (!perApplication && (def.stage > stage || (def.until && stage > def.until))) continue;
      if (def.applies && !def.applies(ctx, s)) continue;
      const id = stepId(def, s);
      const done = def.done(ctx, s);
      if (done || (def.markable && ctx.marked(id))) {
        completed.push(id);
        if (!done) marked.push(id);
        continue;
      }
      if (blocked && def.id !== "S1.06") continue;
      const params = def.params?.(ctx, s) ?? {};
      const { title, reason } = render(def.copyKey?.(ctx, s) ?? def.id, params);
      const app = s.app;
      const track = app?.trackId ? input.tracks.find((t) => t.id === app.trackId) : undefined;
      const factRefs = def.factRefs?.(ctx, s) ?? [];
      const source = sourceFor(input, factRefs);
      open.push({
        id,
        catalogueId: def.id,
        stage: def.stage,
        title,
        reason,
        copy: { key: def.copyKey?.(ctx, s) ?? def.id, params },
        href: def.href(ctx, s),
        dueAt: def.dueAt?.(ctx, s) ?? null,
        dismissable: def.dismissable,
        markable: Boolean(def.markable),
        factRefs,
        ...(source ? { source } : {}),
        ...(track ? { trackLabel: track.name } : {}),
        ...(app ? { application: { id: app.id, label: courseLabel(app) } } : {}),
        ...(def.parentTitle ? { parentTitle: fillWithin(def.parentTitle, params, TITLE_MAX) } : {}),
        order,
        ...(def.leadDays ? { leadDays: def.leadDays } : {}),
      });
    }
  });
  return { open, completed, marked };
}
