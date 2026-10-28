import { describe, expect, it } from "vitest";
import { groupByMonth, type CalendarDeadline } from "./deadline-calendar";

const row = (over: Partial<CalendarDeadline> = {}): CalendarDeadline => ({
  programSlug: "msc-x",
  programTitle: "MSc X",
  institution: "X University",
  country: "GB",
  level: "master",
  kind: "application",
  dueAt: "2027-03-15T12:00:00Z",
  timezone: "Europe/London",
  precision: "date",
  status: "verified",
  ...over,
});

describe("groupByMonth", () => {
  it("groups by the deadline's own time zone", () => {
    const r = groupByMonth([row({ dueAt: "2027-01-31T20:00:00Z", timezone: "Asia/Kolkata" })], new Date("2026-11-01"));
    expect(r[0].month).toBe("2027-02");
  });

  it("drops past deadlines", () => {
    expect(groupByMonth([row({ dueAt: "2026-10-01T00:00:00Z" })], new Date("2026-11-01"))).toEqual([]);
  });

  it("orders months and items", () => {
    const rows = [
      row({ programSlug: "c", dueAt: "2027-03-20T12:00:00Z" }),
      row({ programSlug: "a", dueAt: "2027-02-10T12:00:00Z" }),
      row({ programSlug: "b", dueAt: "2027-03-02T12:00:00Z" }),
    ];
    const r = groupByMonth(rows, new Date("2026-11-01"));
    expect(r.map((m) => m.month)).toEqual(["2027-02", "2027-03"]);
    expect(r[1].items.map((i) => i.programSlug)).toEqual(["b", "c"]);
    expect(r[0].label).toBe("February 2027");
  });
});
