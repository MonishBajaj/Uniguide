/**
 * Journey M2 (J2.4): which step actions are allowed, where to go back to, and the status message
 * after an action. Pure, so the server actions and their tests share it.
 */
import type { JourneyResult } from "@uniguide/journey";

export type StepAction = "snooze" | "dismiss" | "markDone" | "restore";

/**
 * Snooze, dismiss and mark done only work on the student's own open steps (and only where the
 * catalogue allows them); bring back only on steps they snoozed, dismissed or marked done.
 */
export function allowedAction(result: Pick<JourneyResult, "steps" | "hidden" | "marked">, stepId: string, action: StepAction): boolean {
  if (action === "restore") return result.hidden.some((h) => h.id === stepId) || result.marked.includes(stepId);
  const step = result.steps.find((s) => s.id === stepId);
  if (!step) return false;
  if (action === "markDone") return step.markable;
  return step.dismissable;
}

/** Pages a step action may return to. Anything else goes home. */
const RETURN_TO = ["/app", "/app/steps"] as const;
export const returnPath = (from: unknown): (typeof RETURN_TO)[number] =>
  (RETURN_TO as readonly string[]).includes(from as string) ? (from as (typeof RETURN_TO)[number]) : "/app";

/** The status shown after an action, read back from the URL (`?did=dismiss&step=S2.03`). */
export interface StepStatus {
  did: Exclude<StepAction, "restore"> | "restore";
  stepId: string;
}

export function readStatus(params: { did?: string | string[]; step?: string | string[] }): StepStatus | null {
  const did = typeof params.did === "string" ? params.did : null;
  const stepId = typeof params.step === "string" ? params.step : null;
  if (!did || !stepId || !["snooze", "dismiss", "markDone", "restore"].includes(did)) return null;
  if (!/^S[1-7]\.[0-9]{2}(-check)?(:[A-Za-z0-9:_-]+)?$/.test(stepId)) return null;
  return { did: did as StepStatus["did"], stepId };
}
