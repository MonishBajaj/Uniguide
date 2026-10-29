import { describe, expect, it } from "vitest";
import { amaPhase, amaWhen } from "./ama";

const ama = { starts_at: "2026-11-10T14:00:00Z", ends_at: "2026-11-10T15:30:00Z" };

describe("amaPhase", () => {
  it("is upcoming, live, then past", () => {
    expect(amaPhase(ama, new Date("2026-11-09T00:00:00Z"))).toBe("upcoming");
    expect(amaPhase(ama, new Date("2026-11-10T14:00:00Z"))).toBe("live");
    expect(amaPhase(ama, new Date("2026-11-10T15:30:00Z"))).toBe("past");
  });
  it("states the time in UTC", () => {
    expect(amaWhen(ama)).toBe("Tuesday, 10 November 2026, 14:00 to 15:30 UTC");
  });
});
