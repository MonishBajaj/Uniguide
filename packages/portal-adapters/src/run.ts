// The guided-apply run (spec 6.2, plan A2.1): pure states and transitions, with no browser in sight.
//
// The executor (the content script and panel, A2.2) asks nextAction() before every single action and reports
// what happened as an event. Pause and Stop are events like any other, so they always take effect before the
// next action: there is no action queue to drain. Every pause has a reason the audit log accepts.
import type { PageId } from "./match";

/** Why a run waits for the student. Each one is a reason `log_assist_event` accepts. */
export const PAUSE_REASONS = [
  "no_match", // a field with no confident match
  "no_value", // a required field without a confirmed value
  "format_differs", // the portal wants a format or option the student hasn't entered
  "student", // a field the extension never fills (names, for example), or the student pressed Pause
  "page_differs", // the page doesn't match the adapter's map
  "captcha", // a CAPTCHA or other security check
  "sign_in", // a sign-in screen
  "payment", // the fee page: pay or ask for a waiver
  "fee_waiver",
  "declaration", // a declaration, signature or certification
  "unexpected", // anything else
  "guard", // the guard refused the next-page control
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export type RunStatus = "ready" | "filling" | "paused" | "moving" | "handed_back" | "at_review" | "stopped" | "finished";

export interface Run {
  status: RunStatus;
  /** Pages visited in this run, from 1. */
  page: number;
  pageId: string | null;
  /** Within filling: check the page, then plan it, then fill. Within moving: click, then wait. */
  step?: "check" | "plan" | "fill" | "click" | "wait";
  /** What to fill on this page, and whether to pause afterwards. */
  plan?: { toFill: string[]; pause: { reason: PauseReason; fields?: string[] } | null };
  pause?: { reason: PauseReason; fields?: string[]; detail?: string };
  /** Which next-page control to press: the page's Continue, or the dashboard's way into the application. */
  control?: "continue" | "start";
  /** Fields the student chose to skip on this page (logged by the executor). */
  skipped: string[];
  history: { page: number; pageId: string | null; reason: PauseReason }[];
  submitted?: "confirmation_page" | "student_said_submitted";
}

export type RunEvent =
  | { type: "start" }
  | { type: "page_seen"; page: PageId }
  | { type: "planned"; toFill: string[]; pause: { reason: PauseReason; fields?: string[] } | null }
  | { type: "filled" }
  | { type: "clicked" }
  | { type: "move_blocked"; why: string }
  | { type: "page_loaded"; page: PageId; errorsShown: boolean }
  | { type: "load_timeout" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "skip"; key: string }
  | { type: "take_over" }
  | { type: "restart" }
  | { type: "stop" }
  | { type: "submitted"; how: "confirmation_page" | "student_said_submitted" };

export type RunAction =
  | { type: "check_page" }
  | { type: "plan_page" }
  | { type: "fill"; keys: string[] }
  | { type: "click_next"; control: "continue" | "start" }
  | { type: "wait_for_page" };

/** Real applications have a dozen or two pages; past this the run is lost, and says so. */
export const MAX_PAGES = 40;

export const startRun = (): Run => ({ status: "ready", page: 1, pageId: null, skipped: [], history: [] });

export const isFinal = (run: Run) => run.status === "stopped" || run.status === "finished";

/** The one thing the executor should do next, or null when the run is waiting for the student or done. */
export function nextAction(run: Run): RunAction | null {
  if (run.status === "filling") {
    if (run.step === "check") return { type: "check_page" };
    if (run.step === "plan") return { type: "plan_page" };
    if (run.step === "fill") return { type: "fill", keys: run.plan?.toFill ?? [] };
  }
  if (run.status === "moving") {
    if (run.step === "click") return { type: "click_next", control: run.control ?? "continue" };
    if (run.step === "wait") return { type: "wait_for_page" };
  }
  return null;
}

function paused(run: Run, reason: PauseReason, extra: { fields?: string[]; detail?: string } = {}): Run {
  const { step: _s, plan: _p, ...rest } = run;
  return {
    ...rest,
    status: "paused",
    pause: { reason, ...(extra.fields ? { fields: extra.fields } : {}), ...(extra.detail ? { detail: extra.detail } : {}) },
    history: [...run.history, { page: run.page, pageId: run.pageId, reason }],
  };
}

const filling = (run: Run, step: "check" | "plan" | "fill" = "check"): Run => {
  const { pause: _p, control: _c, ...rest } = run;
  return { ...rest, status: "filling", step };
};

/** What a page's kind means for the run, before any field is looked at. */
function onPageSeen(run: Run, page: PageId): Run {
  const at = { ...run, pageId: page.pageId ?? run.pageId };
  if (page.kind === "confirmation") return finish(at, "confirmation_page");
  if (page.kind === "review") {
    const { step: _s, plan: _p, pause: _q, ...rest } = at;
    return { ...rest, status: "at_review" };
  }
  if (page.kind === "sign_in") return paused(at, "sign_in");
  if (page.kind === "security") return paused(at, "captcha");
  if (page.kind === "fee") return paused(at, "payment");
  if (page.kind === "declaration") return paused(at, "declaration");
  if (page.kind === "unknown") return paused(at, "unexpected");
  if (!page.matchesMap) return paused(at, "page_differs");
  if (page.kind === "dashboard") return { ...at, status: "moving", step: "click", control: "start" };
  return { ...at, step: "plan" };
}

function finish(run: Run, how: "confirmation_page" | "student_said_submitted"): Run {
  const { step: _s, plan: _p, pause: _q, ...rest } = run;
  return { ...rest, status: "finished", submitted: how };
}

export function runStep(run: Run, e: RunEvent): Run {
  if (isFinal(run)) return run;

  // Always available, and always before the next action.
  if (e.type === "stop") {
    const { step: _s, plan: _p, ...rest } = run;
    return { ...rest, status: "stopped" };
  }

  switch (run.status) {
    case "ready":
      return e.type === "start" ? filling(run) : run;

    case "filling":
      if (e.type === "pause") return paused(run, "student");
      if (e.type === "take_over") return { ...run, status: "handed_back", step: undefined, plan: undefined };
      if (run.step === "check" && e.type === "page_seen") return onPageSeen(run, e.page);
      if (run.step === "plan" && e.type === "planned") return { ...run, step: "fill", plan: { toFill: e.toFill, pause: e.pause } };
      if (run.step === "fill" && e.type === "filled") {
        // The confident fields are filled first; then the run pauses if anything needs the student.
        const pause = run.plan?.pause;
        if (pause) return paused(run, pause.reason, pause.fields ? { fields: pause.fields } : {});
        const { plan: _p, ...rest } = run;
        return { ...rest, status: "moving", step: "click", control: "continue" };
      }
      return run;

    case "moving":
      if (e.type === "pause") return paused(run, "student");
      if (e.type === "take_over") return { ...run, status: "handed_back", step: undefined };
      if (run.step === "click" && e.type === "clicked") return { ...run, step: "wait" };
      if (run.step === "click" && e.type === "move_blocked") return paused(run, "guard", { detail: e.why });
      if (run.step === "wait" && e.type === "load_timeout") return paused(run, "unexpected", { detail: "no_next_page" });
      if (run.step === "wait" && e.type === "page_loaded") {
        if (e.errorsShown) return paused(run, "unexpected", { detail: "portal_errors" });
        const sameUrl = e.page.pageId !== undefined && e.page.pageId === run.pageId && e.page.kind === "form";
        if (sameUrl) return paused(run, "unexpected", { detail: "same_page" });
        if (run.page + 1 > MAX_PAGES) return paused(run, "unexpected", { detail: "too_many_pages" });
        const next: Run = { ...run, page: run.page + 1, pageId: e.page.pageId ?? null, skipped: [] };
        if (e.page.kind === "review" || e.page.kind === "confirmation") return onPageSeen(next, e.page);
        return filling(next);
      }
      return run;

    case "paused":
      if (e.type === "resume") return filling(run);
      if (e.type === "skip") return run.skipped.includes(e.key) ? run : { ...run, skipped: [...run.skipped, e.key] };
      if (e.type === "take_over") return { ...run, status: "handed_back" };
      if (e.type === "page_seen" && e.page.kind === "confirmation") return finish(run, "confirmation_page");
      return run;

    case "handed_back":
      if (e.type === "restart") return filling(run);
      if (e.type === "page_seen" && e.page.kind === "confirmation") return finish(run, "confirmation_page");
      return run;

    case "at_review":
      // The run stops here: the student checks and submits. Only the submission (or Stop) changes anything.
      if (e.type === "page_seen" && e.page.kind === "confirmation") return finish(run, "confirmation_page");
      if (e.type === "submitted") return finish(run, e.how);
      return run;
  }
  return run;
}
