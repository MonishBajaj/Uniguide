import { describe, expect, it, vi } from "vitest";
import { STAGE_FIXTURES } from "../../../packages/journey/test/fixtures";
import { bearerMatches, recomputeBatch, validCursor } from "./journey-cron";
import type { JourneyRpc } from "./journey-snapshot";

const snapshot = (() => {
  const json = JSON.parse(JSON.stringify(STAGE_FIXTURES["stage-2-exploring"]!.input));
  delete json.today;
  return json;
})();

const USERS = ["u1", "u2", "u3", "u4", "u5"];

/** A fake database with five due students; `broken` students' snapshots fail. */
function fakeDb(broken: string[] = []) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    if (fn === "journey_due_users") {
      const after = args.p_after as string | null;
      const from = after ? USERS.indexOf(after) + 1 : 0;
      return { data: USERS.slice(from, from + (args.p_limit as number)), error: null };
    }
    if (fn === "journey_snapshot" && broken.includes(args.p_user as string)) return { data: null, error: { message: "boom" } };
    if (fn === "journey_snapshot") return { data: snapshot, error: null };
    return { data: null, error: null };
  });
  return { client: { rpc } as JourneyRpc, rpc };
}

describe("recomputeBatch", () => {
  it("pages until fewer students than the limit come back", async () => {
    const { client } = fakeDb();
    const first = await recomputeBatch(client, "t", null, "2026-11-02", 2);
    expect(first).toEqual({ processed: 2, failed: 0, next: "u2" });
    const second = await recomputeBatch(client, "t", first.next, "2026-11-02", 2);
    expect(second).toEqual({ processed: 2, failed: 0, next: "u4" });
    expect(await recomputeBatch(client, "t", second.next, "2026-11-02", 2)).toEqual({ processed: 1, failed: 0, next: null });
  });

  it("counts a student's failure and carries on", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeDb(["u2"]);
    expect(await recomputeBatch(client, "t", null, "2026-11-02", 10)).toEqual({ processed: 4, failed: 1, next: null });
    log.mockRestore();
  });

  it("reads and saves each student once, always with the token", async () => {
    const { client, rpc } = fakeDb();
    await recomputeBatch(client, "secret", null, "2026-11-02", 10);
    expect(rpc).toHaveBeenCalledWith("journey_due_users", { p_token: "secret", p_after: null, p_limit: 10 });
    for (const u of USERS) {
      const calls = rpc.mock.calls.filter(([, args]) => (args as { p_user?: string })?.p_user === u);
      expect(calls.map(([fn]) => fn)).toEqual(["journey_snapshot", "save_journey_state"]);
      for (const [, args] of calls) expect(args).toMatchObject({ p_token: "secret" });
    }
  });

  it("stops the whole batch only when the student list can't be read", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "Not allowed" } }) } as JourneyRpc;
    await expect(recomputeBatch(client, "wrong", null, "2026-11-02")).rejects.toThrow(/Not allowed/);
  });
});

describe("request checks", () => {
  it("accepts only the exact bearer token", () => {
    expect(bearerMatches("Bearer abc", "abc")).toBe(true);
    expect(bearerMatches("Bearer abd", "abc")).toBe(false);
    expect(bearerMatches("abc", "abc")).toBe(false);
    expect(bearerMatches(null, "abc")).toBe(false);
  });

  it("ignores a cursor that isn't an id", () => {
    expect(validCursor("00000000-0000-4000-a000-000000000002")).toBe("00000000-0000-4000-a000-000000000002");
    expect(validCursor("'; drop table x")).toBeNull();
    expect(validCursor(null)).toBeNull();
  });
});
