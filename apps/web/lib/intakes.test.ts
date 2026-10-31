import { describe, expect, it } from "vitest";
import { intakeName, openIntakes, type IntakeCycle } from "./intakes";

const now = new Date("2027-01-15T12:00:00Z");
const cycle = (id: string, term: string, year: number, deadlines: IntakeCycle["deadlines"]): IntakeCycle => ({
  id, label: `${year}-${term}`, intake_year: year, intake_term: term, deadlines,
});
const app = (due_at: string, status = "verified", published = true) => ({ kind: "application", due_at, status, published });

describe("openIntakes", () => {
  it("keeps intakes with a known application deadline ahead, soonest first", () => {
    const open = openIntakes(
      [
        cycle("spring", "spring", 2028, [app("2027-10-01T23:59:00Z", "unverified")]),
        cycle("autumn", "autumn", 2027, [app("2027-03-01T23:59:00Z"), app("2027-02-01T23:59:00Z")]),
        cycle("past", "autumn", 2026, [app("2026-12-01T23:59:00Z")]),
      ],
      now,
    );
    expect(open).toEqual([
      { id: "autumn", name: "Autumn 2027", applyBy: "2027-02-01T23:59:00Z", status: "verified" },
      { id: "spring", name: "Spring 2028", applyBy: "2027-10-01T23:59:00Z", status: "unverified" },
    ]);
  });

  it("ignores unknown, unpublished and other kinds of deadline", () => {
    const open = openIntakes(
      [
        cycle("a", "autumn", 2027, [app("2027-03-01T23:59:00Z", "unknown")]),
        cycle("b", "autumn", 2027, [app("2027-03-01T23:59:00Z", "verified", false)]),
        cycle("c", "autumn", 2027, [{ kind: "deposit", due_at: "2027-03-01T23:59:00Z", status: "verified" }]),
        cycle("d", "autumn", 2027, [{ kind: "application", due_at: null, status: "verified" }]),
      ],
      now,
    );
    expect(open).toEqual([]);
  });

  it("names an intake from its term and year", () => {
    expect(intakeName({ intake_term: "semester_1", intake_year: 2028 })).toBe("Semester 1 2028");
  });
});
