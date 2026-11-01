import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const loadMatchInputs = vi.fn();
vi.mock("@/lib/match-data", () => ({ loadMatchInputs: (...args: unknown[]) => loadMatchInputs(...args) }));
vi.mock("@uniguide/matching", () => ({
  matchPrograms: (programs: { id: string }[]) => ({
    results: programs.map((p) => ({ programId: p.id, excluded: p.id === "p-excluded" })),
  }),
}));

import { startSearch } from "./start-search";

function client(rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>) {
  return {
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
  };
}

const card = (id: string, institution: string) => ({ id, institution_id: institution });

beforeEach(() => loadMatchInputs.mockReset());

describe("startSearch", () => {
  it("queues the universities of the ranked pool, each once, in order, without excluded courses", async () => {
    loadMatchInputs.mockResolvedValue({
      programs: [{ id: "p1" }, { id: "p2" }, { id: "p-excluded" }, { id: "p3" }, { id: "p4" }],
      candidates: [card("p1", "uA"), card("p2", "uB"), card("p-excluded", "uX"), card("p3", "uA"), card("p4", "uC")],
      student: {},
      fx: {},
      weights: {},
    });
    const seen: { name: string; args: Record<string, unknown> }[] = [];
    const result = await startSearch(client(async (name, args) => (seen.push({ name, args }), { error: null })) as never, "u1");
    expect(result).toEqual({ ok: true, message: "Search started." });
    expect(seen).toEqual([{ name: "start_enrichment", args: { p_institution_ids: ["uA", "uB", "uC"] } }]);
  });

  it("asks for a level first when the profile has none", async () => {
    loadMatchInputs.mockResolvedValue(null);
    const result = await startSearch(client(async () => ({ error: null })) as never, "u1");
    expect(result.ok).toBe(false);
  });

  it("with no matching universities and no AI consent says so and does not start a job", async () => {
    loadMatchInputs.mockResolvedValue({ programs: [], candidates: [], student: {}, fx: {}, weights: {} });
    const rpc = vi.fn(async () => ({ error: null }));
    const result = await startSearch(client(rpc) as never, "u1");
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
