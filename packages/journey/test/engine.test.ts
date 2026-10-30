import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, computeJourney } from "../src";
import expected from "./fixtures/expected.json";
import { STAGE_FIXTURES } from "./fixtures";

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
