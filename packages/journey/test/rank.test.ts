import { describe, expect, it } from "vitest";
import { applyStepState, bandFor, computeJourney, isStalled, rankSteps, urgentLabel } from "../src";
import type { Candidate } from "../src";
import { STAGE_FIXTURES, TODAY, application, base, programs, readyProfile } from "./fixtures";

const step = (over: Partial<Candidate> = {}): Candidate => ({
  id: "S4.14:a1",
  catalogueId: "S4.14",
  stage: 4,
  title: "t",
  reason: "r",
  copy: { key: "S4.14", params: {} },
  href: "/app/tracker",
  dueAt: null,
  dismissable: true,
  factRefs: [],
  order: 30,
  ...over,
});

const inDays = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("bands", () => {
  it("counts due today, overdue and due in 14 days as urgent, but not 15", () => {
    expect(bandFor(step({ dueAt: inDays(0) }), 4, TODAY)).toBe("urgent");
    expect(bandFor(step({ dueAt: inDays(-3) }), 4, TODAY)).toBe("urgent");
    expect(bandFor(step({ dueAt: `${inDays(14)}T23:59:00Z` }), 4, TODAY)).toBe("urgent");
    expect(bandFor(step({ dueAt: inDays(15) }), 4, TODAY)).toBe("stage");
  });

  it("uses due date minus lead time for long-lead steps", () => {
    expect(bandFor(step({ dueAt: inDays(35), leadDays: 21 }), 4, TODAY)).toBe("long_lead");
    expect(bandFor(step({ dueAt: inDays(36), leadDays: 21 }), 4, TODAY)).toBe("stage");
  });

  it("puts steps of other stages in carry-over", () => {
    expect(bandFor(step({ stage: 2 }), 4, TODAY)).toBe("carry_over");
    expect(bandFor(step({ stage: 5 }), 4, TODAY)).toBe("carry_over");
    expect(bandFor(step({ stage: 4 }), 4, TODAY)).toBe("stage");
  });

  it("ranks a step due tomorrow above a stage step due next month, and ties by catalogue order", () => {
    const ranked = rankSteps(
      [
        step({ id: "late", dueAt: inDays(30), order: 1 }),
        step({ id: "b", dueAt: inDays(1), order: 9 }),
        step({ id: "a", dueAt: inDays(1), order: 2 }),
        step({ id: "undated", order: 0 }),
      ],
      4,
      TODAY,
    );
    // Same band: dated before undated, even when the undated step comes first in the catalogue.
    expect(ranked.map((s) => s.id)).toEqual(["a", "b", "late", "undated"]);
    expect(ranked.map((s) => s.rank)).toEqual(["urgent", "urgent", "stage", "stage"]);
    expect(ranked[0]).not.toHaveProperty("order");
  });
});

describe("snooze and dismiss", () => {
  it("hides a snoozed step until its date and shows it on that date", () => {
    const rows = [{ stepId: "S4.14:a1", state: "snoozed" as const, until: inDays(7) }];
    expect(applyStepState([step()], rows, inDays(6))).toEqual([]);
    expect(applyStepState([step()], rows, inDays(7))).toHaveLength(1);
  });

  it("never shows a dismissed step, unless the step can't be dismissed", () => {
    const rows = [{ stepId: "S4.14:a1", state: "dismissed" as const, until: null }];
    expect(applyStepState([step()], rows, TODAY)).toEqual([]);
    expect(applyStepState([step({ dismissable: false })], rows, TODAY)).toHaveLength(1);
  });

  it("keeps S1.06 visible when the student tries to dismiss or snooze it", () => {
    const input = {
      ...STAGE_FIXTURES["edge-pending-consent"]!.input,
      stepState: [{ stepId: "S1.06", state: "dismissed" as const, until: null }],
    };
    expect(computeJourney(input).steps.map((s) => s.id)).toContain("S1.06");
  });
});

describe("stalled", () => {
  it("needs 14 days without a completion and something due within 30 days", () => {
    const due30 = [{ dueAt: inDays(30) }];
    expect(isStalled(inDays(-14), due30, TODAY)).toBe(true);
    expect(isStalled(inDays(-13), due30, TODAY)).toBe(false);
    expect(isStalled(inDays(-14), [{ dueAt: inDays(31) }], TODAY)).toBe(false);
    expect(isStalled(inDays(-40), [{ dueAt: inDays(-2) }], TODAY)).toBe(true);
    expect(isStalled(inDays(-40), [{ dueAt: null }], TODAY)).toBe(false);
    expect(isStalled(null, due30, TODAY)).toBe(false);
  });
});

describe("result", () => {
  it("labels urgent steps as one sentence", () => {
    expect(urgentLabel(0)).toBeNull();
    expect(urgentLabel(1)).toBe("1 step due this fortnight");
    expect(urgentLabel(2)).toBe("2 steps due this fortnight");
  });

  it("reads '2 of 3 applications ready' in stage 4", () => {
    const done = [{ id: "c", title: "x", done: true, dueAt: null, kind: "requirement", link: null, countryRuleId: null }];
    const input = base({
      profile: readyProfile,
      applications: [
        application("a1", programs.exampleton!, { status: "preparing", checklist: done }),
        application("a2", programs.tum!, { status: "submitted" }),
        application("a3", programs.state!, { status: "preparing" }),
      ],
    });
    const r = computeJourney(input);
    expect(r.stage).toBe(4);
    expect(r.stageProgress).toEqual({ done: 2, total: 3, label: "2 of 3 applications ready" });
  });

  it("has a progress label for every stage", () => {
    for (const [name, f] of Object.entries(STAGE_FIXTURES)) expect(computeJourney(f.input).stageProgress.label, name).not.toBe("");
  });

  it("counts urgent steps", () => {
    const input = base({
      profile: readyProfile,
      applications: [application("a1", programs.exampleton!, { status: "preparing", deadlines: [{ id: "d", dueAt: `${inDays(5)}T23:59:00Z`, timezone: "UTC", precision: "date", status: "verified" }] })],
    });
    const r = computeJourney(input);
    expect(r.urgentCount).toBeGreaterThan(0);
    expect(r.urgentLabel).toBe(`${r.urgentCount} ${r.urgentCount === 1 ? "step" : "steps"} due this fortnight`);
    expect(r.steps[0]!.rank).toBe("urgent");
  });
});
