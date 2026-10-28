import { describe, expect, it } from "vitest";
import { ageFromBirthMonth, safeNext } from "./age";

describe("ageFromBirthMonth", () => {
  const today = new Date("2026-10-28T12:00:00Z");

  it("counts a birthday later this month as not yet reached", () => {
    expect(ageFromBirthMonth("2013-10", today)).toBe(12);
    expect(ageFromBirthMonth("2013-09", today)).toBe(13);
  });

  it("rejects malformed input", () => {
    expect(ageFromBirthMonth("2013-13", today)).toBeNull();
    expect(ageFromBirthMonth("13/2013", today)).toBeNull();
  });
});

describe("safeNext", () => {
  it("allows only same-site paths", () => {
    expect(safeNext("/app/match")).toBe("/app/match");
    expect(safeNext("//evil.example")).toBe("/app/profile");
    expect(safeNext("https://evil.example")).toBe("/app/profile");
  });
});

import { deadlineText } from "./format";

describe("deadlineText", () => {
  it("shows the date in the institution's time zone, not the server's", () => {
    // 15 Jan 2027, 23:59 in New York is already 16 Jan in UTC.
    expect(deadlineText("2027-01-16T04:59:00Z", "America/New_York", "exact_time")).toMatch(/^15 January 2027, 23:59/);
    // Date-only UK deadline stored as local midnight (BST) is still 30 June.
    expect(deadlineText("2027-06-29T23:00:00Z", "Europe/London", "date")).toBe("30 June 2027");
  });
});
