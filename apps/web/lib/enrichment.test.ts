import { describe, expect, it } from "vitest";
import {
  describeItem,
  itemLabel,
  pickCourses,
  pickInstitutions,
  progressSummary,
  QUEUE,
  readyForFirstSearch,
  stageIndex,
  STAGES,
  waitNotice,
} from "./enrichment";

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

describe("itemLabel for a course that was read but is not complete", () => {
  it("says what is missing and warns", () => {
    expect(itemLabel("incomplete")).toEqual({ text: "Read, but a deadline, cost or requirement is missing", tone: "warn" });
  });
});

describe("pickInstitutions", () => {
  const ranked = (ids: string[]) => ids.map((institutionId, i) => ({ programId: `p${i}`, institutionId }));
  it("keeps each university once, in the order first seen", () => {
    expect(pickInstitutions(ranked(["a", "b", "a", "c", "b"]), 10)).toEqual(["a", "b", "c"]);
  });
  it("stops at the limit", () => {
    expect(pickInstitutions(ranked(["a", "b", "c", "d"]), 2)).toEqual(["a", "b"]);
  });
  it("queues at most thirty universities", () => {
    const many = ranked(Array.from({ length: 50 }, (_, i) => `u${i}`));
    expect(QUEUE).toBe(30);
    expect(pickInstitutions(many, QUEUE)).toHaveLength(30);
  });
  it("is empty for an empty pool", () => {
    expect(pickInstitutions([], QUEUE)).toEqual([]);
  });
});

describe("progressSummary", () => {
  it("counts while the search runs", () => {
    expect(progressSummary({ tried: 22, kept: 7, status: "running" })).toBe("Checked 22 universities, kept 7 courses.");
  });
  it("reports a finished search that reached its target", () => {
    expect(progressSummary({ tried: 22, kept: 10, status: "done" })).toBe("Checked 22 universities, kept 10 courses.");
  });
  it("says how many were found when a finished search falls short", () => {
    expect(progressSummary({ tried: 30, kept: 4, status: "done" })).toBe("We found 4 complete courses after checking 30 universities.");
  });
  it("says so plainly when nothing qualified", () => {
    expect(progressSummary({ tried: 30, kept: 0, status: "done" })).toBe("We could not find a university with complete information yet.");
  });
  it("uses the singular for one", () => {
    expect(progressSummary({ tried: 1, kept: 1, status: "running" })).toBe("Checked 1 university, kept 1 course.");
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

describe("describeItem", () => {
  it("names a course the student can see", () => {
    expect(describeItem({ title: "MSc Robotics", institutions: { name: "TUM" } })).toEqual({ title: "MSc Robotics", subtitle: "TUM" });
  });
  it("explains a suggested course the student cannot see yet", () => {
    const d = describeItem(null);
    expect(d.title).toBe("Suggested course");
    expect(d.subtitle).toMatch(/team is checking/i);
  });
});
