import { describe, expect, it } from "vitest";
import { deadlineIsStale, feeIsStale, feeStartYear } from "./freshness";

const now = new Date("2026-11-30T00:00:00Z");

describe("freshness", () => {
  it("flags a verified upcoming deadline not re-checked in 30 days", () => {
    expect(deadlineIsStale({ status: "verified", verified_at: "2026-10-01T00:00:00Z", due_at: "2027-01-15T00:00:00Z" }, now)).toBe(true);
    expect(deadlineIsStale({ status: "verified", verified_at: "2026-11-15T00:00:00Z", due_at: "2027-01-15T00:00:00Z" }, now)).toBe(false);
    expect(deadlineIsStale({ status: "verified", verified_at: "2026-01-01T00:00:00Z", due_at: "2026-06-01T00:00:00Z" }, now)).toBe(false);
  });

  it("flags fees quoted for an earlier year than the intake", () => {
    expect(feeStartYear("2026-27")).toBe(2026);
    expect(feeStartYear("WiSe 2027/28")).toBe(2027);
    expect(feeIsStale({ fee_year: "2026-27" }, 2027)).toBe(true);
    expect(feeIsStale({ fee_year: "2027-28" }, 2027)).toBe(false);
    expect(feeIsStale({ fee_year: null }, 2027)).toBe(false);
  });
});
