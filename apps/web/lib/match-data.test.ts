import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/catalog", () => ({
  loadCurrentCycles: async () => new Map(),
  loadFx: async () => ({}),
  toProgramInput: (card: { id: string }) => ({ id: card.id }),
  toStudentProfile: () => ({}),
}));

import { loadMatchInputs } from "./match-data";

function fakeSupabase(profile: Record<string, unknown>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const table = (rows: unknown) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: rows }) }), then: (r: (v: unknown) => void) => r({ data: [] }) }),
  });
  return {
    calls,
    client: {
      from: (name: string) => table(name === "profiles" ? profile : []),
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: [] };
      },
    },
  };
}

const profile = { target_levels: ["master"], target_countries: ["US"], target_fields: ["07"], preferences: {} };

describe("loadMatchInputs", () => {
  it("asks for courses in the student's subject, ordered by that subject's QS ranks", async () => {
    const { client, calls } = fakeSupabase(profile);
    await loadMatchInputs(client as never, "u1");
    const search = calls.find((c) => c.name === "search_programs");
    expect(search?.args).toMatchObject({ p_levels: ["master"], p_countries: ["US"], p_fields: ["07"], p_limit: 200 });
    expect(search?.args.p_rank_subjects).toContain("Engineering & Technology");
  });

  it("does not filter or reorder by subject when the student chose none", async () => {
    const { client, calls } = fakeSupabase({ ...profile, target_fields: [] });
    await loadMatchInputs(client as never, "u1");
    const args = calls.find((c) => c.name === "search_programs")?.args ?? {};
    expect(args.p_fields).toBeUndefined();
    expect(args.p_rank_subjects).toBeUndefined();
  });
});
