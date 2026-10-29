import type { Tables } from "@uniguide/db-types";
import { describe, expect, it } from "vitest";
import { cardDeadline, closesInText } from "./card-deadline";

const row = (kind: string, due_at: string, precision = "date") =>
  ({ id: kind + due_at, status: "verified", applicant_category: "all", kind, due_at, precision, timezone: "Europe/London" }) as Tables<"deadlines">;

describe("card deadline", () => {
  const now = new Date("2026-12-10T12:00:00Z");

  it("picks the next open application deadline, ignoring other kinds and past dates", () => {
    const d = cardDeadline([row("application", "2026-12-01T00:00:00Z"), row("funding", "2026-12-12T00:00:00Z"), row("application", "2027-01-15T00:00:00Z")], now);
    expect(d?.dueAt).toBe("2027-01-15T00:00:00Z");
  });

  it("keeps a date-only deadline open until the end of its day", () => {
    expect(cardDeadline([row("application", "2026-12-10T00:00:00Z")], now)?.dueAt).toBe("2026-12-10T00:00:00Z");
  });

  it("has nothing to show when no deadline is known or all have passed", () => {
    expect(cardDeadline(undefined, now)).toBeNull();
    expect(cardDeadline([row("application", "2026-11-01T00:00:00Z")], now)).toBeNull();
  });

  it("says how long is left", () => {
    expect(closesInText({ dueAt: "2026-12-10T00:00:00Z" }, now)).toBe("Closes today");
    expect(closesInText({ dueAt: "2026-12-11T06:00:00Z" }, now)).toBe("Closes tomorrow");
    expect(closesInText({ dueAt: "2027-01-15T00:00:00Z" }, now)).toBe("Closes in 36 days");
  });
});
