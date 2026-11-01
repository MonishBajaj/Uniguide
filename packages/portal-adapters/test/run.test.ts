// The guided-apply run (spec 6.2, plan A2.1): pure states and transitions. The executor (A2.2) asks nextAction()
// before every action, so Pause and Stop always land before the next one.
import { describe, expect, it } from "vitest";
import { nextAction, runStep, startRun, isFinal, PAUSE_REASONS, type PageId, type Run, type RunEvent } from "../src/index";

const form = (pageId: string, matchesMap = true): PageId => ({ kind: "form", pageId, matchesMap });
const kind = (k: PageId["kind"], pageId?: string): PageId => ({ kind: k, ...(pageId ? { pageId } : {}), matchesMap: true });

const steps = (run: Run, ...events: RunEvent[]) => events.reduce(runStep, run);

/** A run that has started and is on a matching form page, planned with nothing to pause for. */
const onPage = (pageId = "about-you") =>
  steps(startRun(), { type: "start" }, { type: "page_seen", page: form(pageId) }, { type: "planned", toFill: ["field-email"], pause: null });

describe("starting", () => {
  it("waits on the start screen until the student presses Start", () => {
    const run = startRun();
    expect(run.status).toBe("ready");
    expect(nextAction(run)).toBeNull();
    expect(nextAction(runStep(run, { type: "start" }))).toEqual({ type: "check_page" });
  });

  it("ignores events that don't belong in the current state", () => {
    const run = startRun();
    expect(runStep(run, { type: "filled" })).toBe(run);
    expect(runStep(run, { type: "clicked" })).toBe(run);
  });
});

describe("a page that needs nothing from the student", () => {
  it("checks it, fills the confident fields, then moves on through the next-page control", () => {
    let run = steps(startRun(), { type: "start" }, { type: "page_seen", page: form("about-you") });
    expect(nextAction(run)).toEqual({ type: "plan_page" });
    run = runStep(run, { type: "planned", toFill: ["field-email", "field-country_of_residence"], pause: null });
    expect(nextAction(run)).toEqual({ type: "fill", keys: ["field-email", "field-country_of_residence"] });
    run = runStep(run, { type: "filled" });
    expect(run.status).toBe("moving");
    expect(nextAction(run)).toEqual({ type: "click_next", control: "continue" });
    run = runStep(run, { type: "clicked" });
    expect(nextAction(run)).toEqual({ type: "wait_for_page" });
    run = runStep(run, { type: "page_loaded", page: form("schooling"), errorsShown: false });
    expect(run).toMatchObject({ status: "filling", page: 2, pageId: "schooling" });
    expect(nextAction(run)).toEqual({ type: "check_page" });
  });

  it("starts from the dashboard by opening the application", () => {
    const run = steps(startRun(), { type: "start" }, { type: "page_seen", page: kind("dashboard") });
    expect(run.status).toBe("moving");
    expect(nextAction(run)).toEqual({ type: "click_next", control: "start" });
  });
});

describe("every pause reason pauses, and says why", () => {
  const seen = (page: PageId) => steps(startRun(), { type: "start" }, { type: "page_seen", page });

  it("a page that doesn't match the map", () => {
    expect(seen(form("schooling", false))).toMatchObject({ status: "paused", pause: { reason: "page_differs" } });
  });

  it("a CAPTCHA or security check", () => {
    expect(seen(kind("security", "security-check"))).toMatchObject({ status: "paused", pause: { reason: "captcha" } });
  });

  it("a sign-in screen", () => {
    expect(seen(kind("sign_in"))).toMatchObject({ status: "paused", pause: { reason: "sign_in" } });
  });

  it("the fee page: a payment or fee waiver", () => {
    expect(seen(kind("fee", "fee"))).toMatchObject({ status: "paused", pause: { reason: "payment" } });
  });

  it("a declaration", () => {
    expect(seen(kind("declaration", "declaration"))).toMatchObject({ status: "paused", pause: { reason: "declaration" } });
  });

  it("anything unknown", () => {
    expect(seen(kind("unknown"))).toMatchObject({ status: "paused", pause: { reason: "unexpected" } });
  });

  it("a field with no confident match, or a required field without a confirmed value: after filling the rest", () => {
    for (const reason of ["no_match", "no_value", "format_differs", "student"] as const) {
      let run = steps(startRun(), { type: "start" }, { type: "page_seen", page: form("about-you") });
      run = runStep(run, { type: "planned", toFill: ["field-email"], pause: { reason, fields: ["field-given_names"] } });
      expect(nextAction(run), reason).toEqual({ type: "fill", keys: ["field-email"] });
      run = runStep(run, { type: "filled" });
      expect(run, reason).toMatchObject({ status: "paused", pause: { reason, fields: ["field-given_names"] } });
      expect(nextAction(run)).toBeNull();
    }
  });

  it("the guard refusing the next-page control", () => {
    let run = runStep(onPage(), { type: "filled" });
    run = runStep(run, { type: "move_blocked", why: "submit_unsafe" });
    expect(run).toMatchObject({ status: "paused", pause: { reason: "guard", detail: "submit_unsafe" } });
  });

  it("the portal showing errors, or staying on the same page, after Continue", () => {
    const moved = steps(runStep(onPage(), { type: "filled" }), { type: "clicked" });
    expect(runStep(moved, { type: "page_loaded", page: form("about-you"), errorsShown: true })).toMatchObject({
      status: "paused",
      pause: { reason: "unexpected", detail: "portal_errors" },
    });
    expect(runStep(moved, { type: "page_loaded", page: form("about-you"), errorsShown: false })).toMatchObject({
      status: "paused",
      pause: { reason: "unexpected", detail: "same_page" },
    });
  });

  it("the next page not arriving", () => {
    const moved = steps(runStep(onPage(), { type: "filled" }), { type: "clicked" });
    expect(runStep(moved, { type: "load_timeout" })).toMatchObject({ status: "paused", pause: { reason: "unexpected", detail: "no_next_page" } });
  });

  it("the student pressing Pause", () => {
    expect(runStep(onPage(), { type: "pause" })).toMatchObject({ status: "paused", pause: { reason: "student" } });
  });

  it("uses only reasons the audit log accepts", () => {
    const logReasons = ["no_match", "no_value", "format_differs", "page_differs", "captcha", "sign_in", "payment", "fee_waiver", "declaration", "unexpected", "student", "guard"];
    for (const r of PAUSE_REASONS) expect(logReasons).toContain(r);
  });

  it("keeps a history of where and why it paused", () => {
    let run = steps(startRun(), { type: "start" }, { type: "page_seen", page: kind("security", "security-check") });
    run = steps(run, { type: "resume" }, { type: "page_seen", page: kind("fee", "fee") });
    expect(run.history).toEqual([
      { page: 1, pageId: "security-check", reason: "captcha" },
      { page: 1, pageId: "fee", reason: "payment" },
    ]);
  });
});

describe("re-planning a page", () => {
  it("takes a fresh plan while filling, when filling has revealed more fields, and pauses by the latest one", () => {
    let run = steps(startRun(), { type: "start" }, { type: "page_seen", page: form("tests") }, { type: "planned", toFill: ["english_test_taken"], pause: null });
    run = runStep(run, { type: "planned", toFill: ["field-english_test", "field-english_overall"], pause: { reason: "no_value", fields: ["field-english_date"] } });
    expect(nextAction(run)).toEqual({ type: "fill", keys: ["field-english_test", "field-english_overall"] });
    expect(runStep(run, { type: "filled" })).toMatchObject({ status: "paused", pause: { reason: "no_value" } });
  });
});

describe("Pause, Stop and resume", () => {
  it("Stop takes effect before the next action, whatever was about to happen", () => {
    const states: Run[] = [
      runStep(startRun(), { type: "start" }), // about to check the page
      steps(startRun(), { type: "start" }, { type: "page_seen", page: form("about-you") }), // about to plan
      onPage(), // about to fill
      runStep(onPage(), { type: "filled" }), // about to click next
      steps(runStep(onPage(), { type: "filled" }), { type: "clicked" }), // waiting for the page
    ];
    for (const run of states) {
      expect(nextAction(run)).not.toBeNull();
      const stopped = runStep(run, { type: "stop" });
      expect(stopped.status).toBe("stopped");
      expect(nextAction(stopped)).toBeNull();
      expect(isFinal(stopped)).toBe(true);
    }
  });

  it("a stopped run stays stopped", () => {
    const stopped = runStep(onPage(), { type: "stop" });
    for (const e of [{ type: "resume" }, { type: "start" }, { type: "restart" }, { type: "filled" }] as RunEvent[]) {
      expect(runStep(stopped, e)).toBe(stopped);
    }
  });

  it("Pause before a click means the click doesn't happen", () => {
    const run = runStep(runStep(onPage(), { type: "filled" }), { type: "pause" });
    expect(run.status).toBe("paused");
    expect(nextAction(run)).toBeNull();
  });

  it("resuming checks the page again, since the student may have changed it", () => {
    const paused = runStep(onPage(), { type: "pause" });
    const resumed = runStep(paused, { type: "resume" });
    expect(resumed).toMatchObject({ status: "filling", pageId: "about-you" });
    expect(resumed.pause).toBeUndefined();
    expect(nextAction(resumed)).toEqual({ type: "check_page" });
  });

  it("a skipped field is remembered for that page and logged, and forgotten on the next", () => {
    let run = steps(startRun(), { type: "start" }, { type: "page_seen", page: form("about-you") });
    run = steps(run, { type: "planned", toFill: [], pause: { reason: "student", fields: ["field-phone"] } }, { type: "filled" });
    run = runStep(run, { type: "skip", key: "field-phone" });
    expect(run.skipped).toEqual(["field-phone"]);
    run = steps(run, { type: "resume" }, { type: "page_seen", page: form("about-you") });
    expect(run.skipped).toEqual(["field-phone"]);
    run = steps(run, { type: "planned", toFill: [], pause: null }, { type: "filled" }, { type: "clicked" });
    run = runStep(run, { type: "page_loaded", page: form("schooling"), errorsShown: false });
    expect(run.skipped).toEqual([]);
  });
});

describe("handing back", () => {
  it("the student can take over, and restart from the page they're on", () => {
    const taken = runStep(onPage(), { type: "take_over" });
    expect(taken.status).toBe("handed_back");
    expect(nextAction(taken)).toBeNull();
    const again = runStep(taken, { type: "restart" });
    expect(again).toMatchObject({ status: "filling" });
    expect(nextAction(again)).toEqual({ type: "check_page" });
  });

  it("can take over while paused too", () => {
    expect(runStep(runStep(onPage(), { type: "pause" }), { type: "take_over" }).status).toBe("handed_back");
  });
});

describe("at the review page", () => {
  const atReview = () => {
    const moved = steps(runStep(onPage("declaration"), { type: "filled" }), { type: "clicked" });
    return runStep(moved, { type: "page_loaded", page: kind("review"), errorsShown: false });
  };

  it("stops there and can't move on", () => {
    let run = atReview();
    expect(run.status).toBe("at_review");
    expect(nextAction(run)).toBeNull();
    for (const e of [{ type: "resume" }, { type: "restart" }, { type: "clicked" }, { type: "filled" }, { type: "start" }] as RunEvent[]) {
      run = runStep(run, e);
      expect(run.status).toBe("at_review");
      expect(nextAction(run)).toBeNull();
    }
  });

  it("is also where a check of the review page lands", () => {
    expect(steps(startRun(), { type: "start" }, { type: "page_seen", page: kind("review") }).status).toBe("at_review");
  });

  it("finishes when the portal's confirmation page appears, or the student says they've submitted", () => {
    const viaPage = runStep(atReview(), { type: "page_seen", page: kind("confirmation") });
    expect(viaPage).toMatchObject({ status: "finished", submitted: "confirmation_page" });
    const viaWord = runStep(atReview(), { type: "submitted", how: "student_said_submitted" });
    expect(viaWord).toMatchObject({ status: "finished", submitted: "student_said_submitted" });
    expect(isFinal(viaWord)).toBe(true);
    expect(nextAction(viaWord)).toBeNull();
  });

  it("can still be stopped while waiting at review", () => {
    expect(runStep(atReview(), { type: "stop" }).status).toBe("stopped");
  });
});

describe("runaway protection", () => {
  it("pauses rather than wander forever", () => {
    let run = onPage("p0");
    for (let i = 1; i <= 60 && run.status !== "paused"; i++) {
      run = steps(run, { type: "filled" }, { type: "clicked" }, { type: "page_loaded", page: form(`p${i}`), errorsShown: false });
      if (run.status === "filling") run = steps(run, { type: "page_seen", page: form(`p${i}`) }, { type: "planned", toFill: [], pause: null });
    }
    expect(run).toMatchObject({ status: "paused", pause: { reason: "unexpected", detail: "too_many_pages" } });
  });
});
