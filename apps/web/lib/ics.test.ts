import { describe, expect, it } from "vitest";
import { buildCalendar } from "./ics";

describe("buildCalendar", () => {
  const now = new Date("2026-10-28T12:00:00Z");

  it("makes date-only deadlines all-day on the institution's local date", () => {
    const ics = buildCalendar("Test", [
      { uid: "a", title: "Apply: MSc, Exampleton", start: "2027-06-29T23:00:00Z", allDay: true, timezone: "Europe/London", alarms: [7, 1] },
    ], now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270630");
    expect(ics).toContain("DTEND;VALUE=DATE:20270701");
    expect(ics).toContain("SUMMARY:Apply: MSc\\, Exampleton");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("keeps exact deadlines as UTC instants", () => {
    const ics = buildCalendar("Test", [{ uid: "b", title: "x", start: "2027-01-16T04:59:00Z", allDay: false, timezone: "America/New_York" }], now);
    expect(ics).toContain("DTSTART:20270116T045900Z");
  });

  it("folds long lines at 75 octets", () => {
    const ics = buildCalendar("Test", [{ uid: "c", title: "é".repeat(80), start: "2027-01-01T00:00:00Z", allDay: false, timezone: "UTC" }], now);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
