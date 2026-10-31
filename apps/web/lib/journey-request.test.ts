import { describe, expect, it, vi } from "vitest";
import { STAGE_FIXTURES, TODAY } from "../../../packages/journey/test/fixtures";
import { failureInjected, journeyRequest } from "./journey-request";
import type { JourneyRpc } from "./journey-snapshot";

const snapshot = (() => {
  const json = JSON.parse(JSON.stringify(STAGE_FIXTURES["stage-4-preparing"]!.input));
  delete json.today;
  return json;
})();

function fake(error: string | null = null) {
  const rpc = vi.fn(async (fn: string) =>
    fn === "journey_snapshot" ? (error ? { data: null, error: { message: error } } : { data: snapshot, error: null }) : { data: null, error: null },
  );
  return { client: { rpc } as JourneyRpc, rpc };
}

describe("journeyRequest", () => {
  it("reads the snapshot once for the navigation and the page, and saves that same result", async () => {
    const { client, rpc } = fake();
    const req = journeyRequest(client, TODAY);
    const [nav, page] = await Promise.all([req.get(), req.get()]);
    await req.save();
    expect(nav).toBe(page);
    expect(rpc.mock.calls.filter(([fn]) => fn === "journey_snapshot")).toHaveLength(1);
    expect(rpc.mock.calls.filter(([fn]) => fn === "save_journey_state")).toEqual([["save_journey_state", { p_state: page.result }]]);
    expect(page.result.stage).toBe(4);
    expect(page.input.today).toBe(TODAY);
  });

  it("rejects when the snapshot can't be read, and leaves the decision to the caller", async () => {
    const { client } = fake("Not allowed");
    await expect(journeyRequest(client, TODAY).get()).rejects.toThrow(/Not allowed/);
  });

  it("fails without touching the database when the test switch is on", async () => {
    const { client, rpc } = fake();
    await expect(journeyRequest(client, TODAY, true).get()).rejects.toThrow(/test switch/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("failureInjected", () => {
  it("needs both E2E=1 and the cookie", () => {
    expect(failureInjected({ E2E: "1" }, "1")).toBe(true);
  });

  it("does nothing when E2E isn't set, whatever the cookie says", () => {
    expect(failureInjected({}, "1")).toBe(false);
    expect(failureInjected({ E2E: "" }, "1")).toBe(false);
    expect(failureInjected({ E2E: "0" }, "1")).toBe(false);
    expect(failureInjected({ E2E: "true" }, "1")).toBe(false);
  });

  it("does nothing without the cookie", () => {
    expect(failureInjected({ E2E: "1" }, undefined)).toBe(false);
    expect(failureInjected({ E2E: "1" }, "0")).toBe(false);
  });
});
