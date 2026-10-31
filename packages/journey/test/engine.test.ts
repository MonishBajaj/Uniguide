import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, computeJourney, hasArrived } from "../src";
import expected from "./fixtures/expected.json";
import { STAGE_FIXTURES, application, base, programs, readyProfile } from "./fixtures";

/**
 * The milestone's "done when" (plan J1.4): every stage and entry-path fixture gives its stage and
 * the first three steps a student would see on the home page. Regenerate expected.json only on a
 * deliberate rule change, and bump ENGINE_VERSION with it.
 */
describe("computeJourney on every fixture", () => {
  it("covers every fixture", () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(STAGE_FIXTURES).sort());
  });

  for (const [name, f] of Object.entries(STAGE_FIXTURES)) {
    it(name, () => {
      const r = computeJourney(f.input);
      const want = expected[name as keyof typeof expected];
      expect(r.stage).toBe(f.stage);
      expect(r.stage).toBe(want.stage);
      expect(r.steps.slice(0, 3).map((s) => s.id)).toEqual(want.top3);
      // Never a blank home: every fixture has something to do next, except revoked consent,
      // where nothing personal may be processed and the home shows a banner instead (M2 N17).
      if (f.input.profile.consentState === "revoked") expect(r.steps).toEqual([]);
      else expect(r.steps.length).toBeGreaterThan(0);
      expect(r.engineVersion).toBe(ENGINE_VERSION);
      expect(new Set(r.completed).size).toBe(r.completed.length);
      for (const s of r.steps) expect(r.completed).not.toContain(s.id);
    });
  }
});

describe("arrived (M5 J5.8)", () => {
  const going = (extra: Record<string, unknown> = {}, departureTasks: { applicationId: string; taskKey: string }[] = []) =>
    base({
      today: "2027-09-25",
      profile: readyProfile,
      departureTasks,
      applications: [
        application("a1", programs.tum!, {
          status: "decided", decision: "admitted", offerAcceptedAt: "2027-05-01T00:00:00Z",
          cycle: { id: "c", label: "2027-winter", startsOn: "2027-10-01" }, ...extra,
        }),
      ],
    });

  it("is false before the accepted course starts", () => {
    expect(computeJourney(going()).arrived).toBe(false);
  });
  it("is true once the published start date has passed", () => {
    expect(computeJourney(going({ cycle: { id: "c", label: "2027-winter", startsOn: "2027-09-20" } })).arrived).toBe(true);
  });
  it("is true when the student says they've arrived", () => {
    expect(hasArrived(going({}, [{ applicationId: "a1", taskKey: "arrived" }]))).toBe(true);
  });
  it("only counts an accepted offer", () => {
    expect(hasArrived(going({ offerAcceptedAt: null, cycle: { id: "c", label: "x", startsOn: "2027-09-01" } }))).toBe(false);
  });
});
