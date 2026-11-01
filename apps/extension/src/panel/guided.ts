// The guided-apply runner (plan A2.2): drives the run's state machine (portal-adapters/run.ts) one action at a
// time. It asks nextAction() before every action, including before each single field, so Pause and Stop land
// before the next thing happens. Every page change goes through the guard in the content script.
import { nextAction, runStep, startRun, type PagePlan, type PageId, type PlannedFill, type Run, type RunEvent } from "@uniguide/portal-adapters";
import type { EventKind, FieldView, FillResult, PressResult } from "../messages";

export interface GuidedScan {
  page: PageId;
  fields: FieldView[];
  /** The portal is showing its error summary. */
  errors: boolean;
}

export type { PressResult };

export interface GuidedDeps {
  scan(): Promise<GuidedScan | null>;
  plan(fields: FieldView[], skipped: string[]): PagePlan;
  fill(f: PlannedFill): Promise<FillResult>;
  press(control: "continue" | "start"): Promise<PressResult>;
  /** Resolves true once the next page has loaded, false if it doesn't in time. */
  waitForPage(): Promise<boolean>;
  log(kind: EventKind, role: string | null, page: string | null, source: string | null, reason: string | null): void;
  changed(runner: GuidedRunner): void;
}

const UNKNOWN: PageId = { kind: "unknown", matchesMap: false };
/** Re-plans after filling, in case filling showed more fields; a few rounds at most. */
const MAX_ROUNDS = 3;

export class GuidedRunner {
  run: Run = startRun();
  scan: GuidedScan | null = null;
  plan: PagePlan | null = null;
  private busy = false;

  constructor(private readonly deps: GuidedDeps) {}

  // ------------------------------------------------------------------------------------------- the student's controls

  start() {
    this.dispatch({ type: "start" });
    return this.loop();
  }

  pause() {
    this.dispatch({ type: "pause" });
  }

  stop() {
    this.dispatch({ type: "stop" });
  }

  resume() {
    if (this.run.status !== "paused") return this.loop();
    this.deps.log("resumed", null, this.run.pageId, null, null);
    this.dispatch({ type: "resume" });
    return this.loop();
  }

  skip(key: string) {
    if (this.run.status !== "paused" || this.run.skipped.includes(key)) return;
    const f = this.scan?.fields.find((x) => x.key === key);
    this.deps.log("skipped", f?.role ?? null, this.run.pageId, null, "student");
    this.dispatch({ type: "skip", key });
  }

  takeOver() {
    const before = this.run;
    this.dispatch({ type: "take_over" });
    if (this.run !== before && this.run.status === "handed_back") this.deps.log("took_over", null, this.run.pageId, null, null);
  }

  restart() {
    this.dispatch({ type: "restart" });
    return this.loop();
  }

  submitted(how: "confirmation_page" | "student_said_submitted") {
    this.dispatch({ type: "submitted", how });
  }

  // ------------------------------------------------------------------------------------------- the loop

  private dispatch(e: RunEvent) {
    const before = this.run;
    this.run = runStep(this.run, e);
    if (this.run !== before && this.run.status === "paused" && before.status !== "paused" && this.run.pause) {
      const first = this.run.pause.fields?.[0];
      const role = first ? (this.scan?.fields.find((f) => f.key === first)?.role ?? null) : null;
      this.deps.log("paused", role, this.run.pageId, null, this.run.pause.reason);
    }
    if (this.run !== before) this.deps.changed(this);
  }

  private async loop(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let action = nextAction(this.run); action; action = nextAction(this.run)) {
        switch (action.type) {
          case "check_page": {
            this.scan = await this.deps.scan();
            this.dispatch({ type: "page_seen", page: this.scan?.page ?? UNKNOWN });
            break;
          }
          case "plan_page": {
            this.plan = this.deps.plan(this.scan?.fields ?? [], this.run.skipped);
            this.dispatch({ type: "planned", toFill: this.plan.toFill.map((f) => f.key), pause: this.plan.pause });
            break;
          }
          case "fill":
            await this.fillPage();
            break;
          case "click_next": {
            const res = await this.deps.press(action.control);
            if (res.status === "pressed") {
              this.deps.log("navigated", null, this.run.pageId, null, null);
              this.dispatch({ type: "clicked" });
            } else {
              const why = res.status === "blocked" ? res.why : "not_found";
              this.deps.log("blocked", null, this.run.pageId, null, "guard");
              this.dispatch({ type: "move_blocked", why });
            }
            break;
          }
          case "wait_for_page": {
            const loaded = await this.deps.waitForPage();
            if (!loaded) {
              this.dispatch({ type: "load_timeout" });
              break;
            }
            this.scan = await this.deps.scan();
            this.dispatch({ type: "page_loaded", page: this.scan?.page ?? UNKNOWN, errorsShown: this.scan?.errors ?? false });
            break;
          }
        }
      }
    } finally {
      this.busy = false;
    }
  }

  /** Fill the plan one field at a time, checking before each one that the run is still filling. */
  private async fillPage() {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      for (const f of this.plan?.toFill ?? []) {
        if (this.run.status !== "filling") return; // Pause or Stop: before the next field
        const res = await this.deps.fill(f);
        if (res.status === "filled") this.deps.log("filled", f.role, this.run.pageId, f.source, null);
        else if (res.status === "blocked") this.deps.log("blocked", f.role, this.run.pageId, null, res.logReason);
      }
      if (this.run.status !== "filling") return;
      // Look again: filling may have shown conditional fields, and what's still empty decides the pause.
      this.scan = await this.deps.scan();
      if (this.run.status !== "filling") return;
      this.plan = this.deps.plan(this.scan?.fields ?? [], this.run.skipped);
      this.dispatch({ type: "planned", toFill: this.plan.toFill.map((f) => f.key), pause: this.plan.pause });
      if (this.plan.toFill.length === 0) break;
    }
    if (this.run.status === "filling") this.dispatch({ type: "filled" });
  }
}
