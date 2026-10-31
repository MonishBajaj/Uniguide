import type { Candidate } from "./catalogue";
import { addDays, daysBetween } from "./catalogue/helpers";
import type { Band, HiddenStep, NextStep, Stage, StepStateRow } from "./types";

/** Days ahead that count as urgent, and as "start now" for a long-lead step (spec 4.3). */
export const URGENT_DAYS = 14;
/** Stalled: nothing completed for this many days while a step is due within STALL_DUE_DAYS (spec 4.6). */
export const STALL_IDLE_DAYS = 14;
export const STALL_DUE_DAYS = 30;

const BAND_ORDER: Record<Band, number> = { urgent: 0, long_lead: 1, stage: 2, carry_over: 3 };

/** Enrollment steps after accepting an offer (G13, G14): the spec carries them into stage 7 as its own work. */
export const ENROLLMENT_STEPS = new Set(["S6.05", "S6.06", "S6.07", "S6.08"]);

/** True when a step is the current stage's own work. */
export const inStage = (step: Pick<Candidate, "stage" | "catalogueId">, stage: Stage) =>
  step.stage === stage || (stage === 7 && ENROLLMENT_STEPS.has(step.catalogueId));

export function bandFor(step: Pick<Candidate, "dueAt" | "leadDays" | "stage" | "catalogueId">, stage: Stage, today: string): Band {
  if (step.dueAt && daysBetween(today, step.dueAt) <= URGENT_DAYS) return "urgent";
  if (step.dueAt && step.leadDays && daysBetween(today, addDays(step.dueAt, -step.leadDays)) <= URGENT_DAYS) return "long_lead";
  return inStage(step, stage) ? "stage" : "carry_over";
}

/**
 * Hides dismissed steps, and snoozed ones until the snooze date (they show again on that date).
 * Steps that can't be dismissed ignore both. The "done" state is read by the catalogue (plan D8).
 */
export function applyStepState<T extends Pick<Candidate, "id" | "dismissable">>(steps: T[], stepState: StepStateRow[], today: string): T[] {
  return splitByStepState(steps, stepState, today).visible;
}

/** The steps to show, and the ones the student snoozed or dismissed, so they can be brought back. */
export function splitByStepState<T extends Pick<Candidate, "id" | "dismissable">>(
  steps: T[],
  stepState: StepStateRow[],
  today: string,
): { visible: T[]; hidden: { step: T; state: HiddenStep["state"]; until: string | null }[] } {
  const byId = new Map(stepState.map((r) => [r.stepId, r]));
  const visible: T[] = [];
  const hidden: { step: T; state: HiddenStep["state"]; until: string | null }[] = [];
  for (const s of steps) {
    const row = byId.get(s.id);
    if (row && s.dismissable && row.state === "dismissed") hidden.push({ step: s, state: "dismissed", until: null });
    else if (row && s.dismissable && row.state === "snoozed" && row.until && row.until.slice(0, 10) > today)
      hidden.push({ step: s, state: "snoozed", until: row.until });
    else visible.push(s);
  }
  return { visible, hidden };
}

/** Bands, then due date (soonest first, undated last), then catalogue order, then id. */
export function rankSteps(steps: Candidate[], stage: Stage, today: string): NextStep[] {
  return steps
    .map((s) => ({ s, rank: bandFor(s, stage, today) }))
    .sort(
      (a, b) =>
        BAND_ORDER[a.rank] - BAND_ORDER[b.rank] ||
        (a.s.dueAt ?? "￿").localeCompare(b.s.dueAt ?? "￿") ||
        a.s.order - b.s.order ||
        a.s.id.localeCompare(b.s.id),
    )
    .map(({ s, rank }) => {
      const { order: _order, leadDays: _lead, ...step } = s;
      return { ...step, rank };
    });
}

/**
 * True when the student completed nothing in 14 days and a step is due within 30 (overdue counts).
 * With no completion recorded yet there is nothing to measure from, so the student is not stalled;
 * the first save records the steps already done (plan D13), which starts the clock.
 */
export function isStalled(lastCompletedAt: string | null, steps: Pick<NextStep, "dueAt">[], today: string): boolean {
  if (!lastCompletedAt || daysBetween(lastCompletedAt, today) < STALL_IDLE_DAYS) return false;
  return steps.some((s) => s.dueAt != null && daysBetween(today, s.dueAt) <= STALL_DUE_DAYS);
}

export function urgentLabel(count: number): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? "step" : "steps"} due this fortnight`;
}
