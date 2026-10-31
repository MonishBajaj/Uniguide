import type { JourneyResult, NextStep } from "@uniguide/journey";
import { describe, expect, it } from "vitest";
import { allowedAction, readStatus, returnPath } from "./journey-actions";

const step = (id: string, over: Partial<NextStep> = {}) => ({ id, dismissable: true, markable: false, ...over }) as NextStep;
const result: Pick<JourneyResult, "steps" | "hidden" | "marked"> = {
  steps: [step("S2.03", { markable: true }), step("S1.06", { dismissable: false }), step("S4.14:a1")],
  hidden: [{ id: "S2.01", catalogueId: "S2.01", title: "Look through your matches", copy: { key: "S2.01", params: {} }, state: "dismissed", until: null }],
  marked: ["S2.04"],
};

describe("allowedAction", () => {
  it("refuses ids the student doesn't have, for every action", () => {
    for (const a of ["snooze", "dismiss", "markDone", "restore"] as const) expect(allowedAction(result, "S9.99", a)).toBe(false);
    expect(allowedAction(result, "S4.14:someone-else", "dismiss")).toBe(false);
  });

  it("lets open, dismissable steps be snoozed and dismissed, but not S1.06", () => {
    expect(allowedAction(result, "S4.14:a1", "snooze")).toBe(true);
    expect(allowedAction(result, "S4.14:a1", "dismiss")).toBe(true);
    expect(allowedAction(result, "S1.06", "snooze")).toBe(false);
    expect(allowedAction(result, "S1.06", "dismiss")).toBe(false);
  });

  it("allows mark done only on steps the student completes themselves", () => {
    expect(allowedAction(result, "S2.03", "markDone")).toBe(true);
    expect(allowedAction(result, "S4.14:a1", "markDone")).toBe(false);
  });

  it("brings back hidden and marked-done steps, and nothing that is already open", () => {
    expect(allowedAction(result, "S2.01", "restore")).toBe(true);
    expect(allowedAction(result, "S2.04", "restore")).toBe(true);
    expect(allowedAction(result, "S2.03", "restore")).toBe(false);
  });
});

describe("returnPath", () => {
  it("goes back to the home or the steps page only", () => {
    expect(returnPath("/app/steps")).toBe("/app/steps");
    expect(returnPath("/app")).toBe("/app");
    expect(returnPath("https://evil.example")).toBe("/app");
    expect(returnPath(null)).toBe("/app");
  });
});

describe("readStatus", () => {
  it("reads a known action and a step id", () => {
    expect(readStatus({ did: "dismiss", step: "S4.14:a1" })).toEqual({ did: "dismiss", stepId: "S4.14:a1" });
  });

  it("ignores anything else", () => {
    expect(readStatus({})).toBeNull();
    expect(readStatus({ did: "delete", step: "S2.03" })).toBeNull();
    expect(readStatus({ did: "dismiss", step: "<script>" })).toBeNull();
    expect(readStatus({ did: ["dismiss"], step: "S2.03" })).toBeNull();
  });
});
