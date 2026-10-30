import { computeJourney } from "@uniguide/journey";
import { describe, expect, it, vi } from "vitest";
import { STAGE_FIXTURES, TODAY } from "../../../packages/journey/test/fixtures";
import { type JourneyRpc, loadJourney, parseSnapshot, utcToday } from "./journey-snapshot";

/** A fixture as journey_snapshot returns it: JSON, without the date. */
const asSnapshot = (input: (typeof STAGE_FIXTURES)[string]["input"]) => {
  const json = JSON.parse(JSON.stringify(input));
  delete json.today;
  return json;
};

function fakeClient(snapshot: unknown, saveError: string | null = null) {
  const rpc = vi.fn(async (fn: string) =>
    fn === "journey_snapshot" ? { data: snapshot, error: null } : { data: null, error: saveError ? { message: saveError } : null },
  );
  return { client: { rpc } as JourneyRpc, rpc };
}

describe("parseSnapshot", () => {
  it("parses every engine fixture and gives the same journey", () => {
    for (const [name, f] of Object.entries(STAGE_FIXTURES)) {
      const input = parseSnapshot(asSnapshot(f.input), TODAY);
      expect(computeJourney(input), name).toEqual(computeJourney(f.input));
    }
  });

  it("fills missing optional blocks with empty values", () => {
    const snapshot = asSnapshot(STAGE_FIXTURES["stage-1-new-account"]!.input);
    for (const block of ["tracks", "countryRules", "stepState", "matchRuns"]) delete snapshot[block];
    const input = parseSnapshot(snapshot, TODAY);
    expect(input.tracks).toEqual([]);
    expect(input.countryRules).toEqual([]);
    expect(input.stepState).toEqual([]);
    expect(input.matchRuns).toEqual({ latestAt: null, feasibleCount: null });
  });

  it("names the field when the snapshot is malformed", () => {
    const bad = asSnapshot(STAGE_FIXTURES["stage-4-preparing"]!.input);
    bad.applications[0].status = "sent";
    expect(() => parseSnapshot(bad, TODAY)).toThrow(/applications\.0\.status/);
    expect(() => parseSnapshot(null, TODAY)).toThrow(/Invalid journey snapshot/);
  });
});

describe("loadJourney", () => {
  it("reads the snapshot once and saves the result once", async () => {
    const { client, rpc } = fakeClient(asSnapshot(STAGE_FIXTURES["stage-4-preparing"]!.input));
    const result = await loadJourney(client, TODAY);
    expect(result.stage).toBe(4);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "journey_snapshot", {});
    expect(rpc).toHaveBeenNthCalledWith(2, "save_journey_state", { p_state: result });
  });

  it("passes the student and token for the daily recompute", async () => {
    const { client, rpc } = fakeClient(asSnapshot(STAGE_FIXTURES["stage-2-exploring"]!.input));
    const result = await loadJourney(client, TODAY, { userId: "u1", token: "t" });
    expect(rpc).toHaveBeenNthCalledWith(1, "journey_snapshot", { p_user: "u1", p_token: "t" });
    expect(rpc).toHaveBeenNthCalledWith(2, "save_journey_state", { p_state: result, p_user: "u1", p_token: "t" });
  });

  it("still returns the result when saving fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(asSnapshot(STAGE_FIXTURES["stage-1-new-account"]!.input), "boom");
    await expect(loadJourney(client, TODAY)).resolves.toMatchObject({ stage: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
    log.mockRestore();
  });

  it("throws when the snapshot can't be read", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "Not allowed" } }) } as JourneyRpc;
    await expect(loadJourney(client, TODAY)).rejects.toThrow(/Not allowed/);
  });
});

it("utcToday is the UTC date", () => {
  expect(utcToday(new Date("2026-10-30T23:30:00-05:00"))).toBe("2026-10-31");
});
