import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyStepState, computeJourney, formatDate, rankSteps } from "../src";
import type { Band, Candidate, FactStatus, Stage, StepStateRow } from "../src";
import { STAGE_FIXTURES, TODAY, application, base, programs, readyProfile } from "./fixtures";

const BAND_ORDER: Record<Band, number> = { urgent: 0, long_lead: 1, stage: 2, carry_over: 3 };
const UNDISMISSABLE = ["S1.06", "S3.05", "S6.04"];

const dateIn = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const candidate = fc
  .record({
    n: fc.nat({ max: 999 }),
    stage: fc.integer({ min: 1, max: 7 }),
    due: fc.option(fc.integer({ min: -30, max: 120 }), { nil: null }),
    leadDays: fc.option(fc.constantFrom(21, 30), { nil: undefined }),
    order: fc.nat({ max: 70 }),
    dismissable: fc.boolean(),
  })
  .map(
    (r): Candidate => ({
      id: `S${r.stage}.01:${r.n}`,
      catalogueId: `S${r.stage}.01`,
      stage: r.stage as Stage,
      title: "t",
      reason: "r",
      copy: { key: "x", params: {} },
      href: "/app",
      dueAt: r.due == null ? null : dateIn(r.due),
      dismissable: r.dismissable,
      markable: false,
      factRefs: [],
      order: r.order,
      ...(r.leadDays ? { leadDays: r.leadDays } : {}),
    }),
  );

const steps = fc.uniqueArray(candidate, { selector: (c) => c.id, maxLength: 30 });
const stage = fc.integer({ min: 1, max: 7 }).map((n) => n as Stage);

describe("ranking properties", () => {
  it("puts every urgent step before every other step, and bands in order", () => {
    fc.assert(
      fc.property(steps, stage, (s, st) => {
        const ranks = rankSteps(s, st, TODAY).map((x) => BAND_ORDER[x.rank]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      }),
    );
  });

  it("never lets due dates go backwards within a band", () => {
    fc.assert(
      fc.property(steps, stage, (s, st) => {
        const ranked = rankSteps(s, st, TODAY);
        for (let i = 1; i < ranked.length; i++) {
          const [a, b] = [ranked[i - 1]!, ranked[i]!];
          if (a.rank !== b.rank || a.dueAt == null) continue;
          expect(b.dueAt == null || b.dueAt >= a.dueAt).toBe(true);
        }
      }),
    );
  });

  it("keeps every step and ranks the same way twice", () => {
    fc.assert(
      fc.property(steps, stage, (s, st) => {
        const once = rankSteps(s, st, TODAY);
        expect(once).toHaveLength(s.length);
        expect(rankSteps([...s].reverse(), st, TODAY)).toEqual(once);
      }),
    );
  });
});

describe("snooze and dismiss properties", () => {
  const row = fc.record({
    state: fc.constantFrom<StepStateRow["state"]>("snoozed", "dismissed", "done"),
    until: fc.integer({ min: -10, max: 10 }),
  });

  it("hides dismissed steps for good and snoozed ones exactly until their date", () => {
    fc.assert(
      fc.property(candidate, row, fc.integer({ min: -10, max: 10 }), (c, r, day) => {
        const state: StepStateRow = { stepId: c.id, state: r.state, until: r.state === "snoozed" ? dateIn(r.until) : null };
        const shown = applyStepState([c], [state], dateIn(day)).length === 1;
        if (!c.dismissable || r.state === "done") expect(shown).toBe(true);
        else if (r.state === "dismissed") expect(shown).toBe(false);
        else expect(shown).toBe(day >= r.until);
      }),
    );
  });

  it("never hides S1.06, S3.05 or S6.04", () => {
    const shown = (input: Parameters<typeof computeJourney>[0]) => computeJourney(input).steps.map((s) => s.catalogueId);
    const nearDeadline = base({
      profile: readyProfile,
      applications: [
        application("a1", programs.exampleton!, { deadlines: [{ id: "d", dueAt: "2026-12-01T23:59:00Z", timezone: "UTC", precision: "date", status: "verified" }] }),
      ],
    });
    const cases = [STAGE_FIXTURES["edge-pending-consent"]!.input, nearDeadline, STAGE_FIXTURES["stage-6-admitted"]!.input];
    fc.assert(
      fc.property(fc.constantFrom<StepStateRow["state"]>("snoozed", "dismissed"), fc.integer({ min: 1, max: 30 }), (state, days) => {
        for (const input of cases) {
          const ids = computeJourney(input).steps.map((s) => s.id).filter((id) => UNDISMISSABLE.some((u) => id.startsWith(u)));
          expect(ids.length).toBeGreaterThan(0);
          const rows = ids.map((stepId) => ({ stepId, state, until: dateIn(days) }));
          for (const id of ids) expect(shown({ ...input, stepState: rows })).toContain(id.split(":")[0]);
        }
      }),
    );
  });
});

describe("fact properties", () => {
  it("quotes a deadline only when it is verified, and passes its status through", () => {
    fc.assert(
      fc.property(fc.constantFrom<FactStatus>("verified", "unverified", "conflicting", "unknown"), fc.integer({ min: 1, max: 69 }), (status, days) => {
        const dueAt = `${dateIn(days)}T23:59:00Z`;
        const input = base({
          profile: readyProfile,
          applications: [application("a1", programs.exampleton!, { deadlines: [{ id: "d1", dueAt, timezone: "Europe/London", precision: "date", status }] })],
        });
        const date = formatDate(dueAt, "Europe/London");
        for (const s of computeJourney(input).steps) {
          for (const f of s.factRefs) expect(f.status).toBe(status);
          if (status !== "verified") expect(s.reason).not.toContain(date);
          expect(s.reason).not.toMatch(/you meet|you don't meet/i);
        }
        const s305 = computeJourney(input).steps.find((s) => s.catalogueId === "S3.05");
        if (status === "unknown") expect(s305).toBeUndefined();
        else expect(s305!.reason.includes(date)).toBe(status === "verified");
      }),
    );
  });

  it("gives the same result for the same input", () => {
    for (const f of Object.values(STAGE_FIXTURES)) expect(computeJourney(structuredClone(f.input))).toEqual(computeJourney(f.input));
  });
});
