import { describe, expect, it } from "vitest";
import { itemLabel, pickCourses, readyForFirstSearch, STAGES, stageIndex, waitNotice } from "./enrichment";

describe("stageIndex", () => {
  it("numbers the stages in the order the worker runs them", () => {
    expect(STAGES.map((s) => stageIndex(s.key))).toEqual([0, 1, 2, 3]);
    expect(stageIndex("optimizing_profile")).toBe(0);
    expect(stageIndex("done")).toBe(3);
  });
  it("is -1 for a stage it does not know", () => {
    expect(stageIndex("exploding")).toBe(-1);
  });
});

describe("itemLabel", () => {
  it("shows reused facts as fine", () => {
    expect(itemLabel("skipped_fresh").tone).toBe("ok");
    expect(itemLabel("extracted").tone).toBe("ok");
  });
  it("warns, in plain words, when an official page could not be read", () => {
    expect(itemLabel("failed")).toEqual({ text: "Couldn't read the official page", tone: "warn" });
  });
  it("shows waiting and running items as not finished", () => {
    expect(itemLabel("pending").tone).toBe("pending");
    expect(itemLabel("waiting").tone).toBe("pending");
    expect(itemLabel("running").tone).toBe("working");
  });
});

describe("pickCourses", () => {
  const ranked = [
    { programId: "a1", institutionId: "A" },
    { programId: "a2", institutionId: "A" },
    { programId: "a3", institutionId: "A" },
    { programId: "a4", institutionId: "A" },
    { programId: "b1", institutionId: "B" },
    { programId: "c1", institutionId: "C" },
  ];
  it("keeps the best first and at most three per university", () => {
    expect(pickCourses(ranked, 10)).toEqual(["a1", "a2", "a3", "b1", "c1"]);
  });
  it("stops at the limit", () => {
    expect(pickCourses(ranked, 2)).toEqual(["a1", "a2"]);
  });
  it("is empty for an empty catalog", () => {
    expect(pickCourses([], 10)).toEqual([]);
  });
});

describe("readyForFirstSearch", () => {
  const ready = { target_levels: ["master"], target_countries: ["DE"], target_fields: ["0613"] };
  it("needs a level, a country and a subject", () => {
    expect(readyForFirstSearch(ready)).toBe(true);
    expect(readyForFirstSearch({ ...ready, target_levels: [] })).toBe(false);
    expect(readyForFirstSearch({ ...ready, target_countries: [] })).toBe(false);
    expect(readyForFirstSearch({ ...ready, target_fields: [] })).toBe(false);
  });
});

describe("waitNotice", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
  it("stays quiet while the worker is picking the search up", () => {
    expect(waitNotice("queued", ago(20), null, now)).toBeNull();
  });
  it("says the search is saved when nothing has started it for a minute", () => {
    expect(waitNotice("queued", ago(90), null, now)).toMatch(/saved/i);
  });
  it("flags a running search whose worker stopped reporting", () => {
    expect(waitNotice("running", ago(600), ago(30), now)).toBeNull();
    expect(waitNotice("running", ago(600), ago(400), now)).toMatch(/longer than usual/i);
  });
  it("says nothing once the search is finished", () => {
    expect(waitNotice("done", ago(9999), ago(9999), now)).toBeNull();
    expect(waitNotice("failed", ago(9999), null, now)).toBeNull();
  });
});
