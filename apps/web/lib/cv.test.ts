import { describe, expect, it } from "vitest";
import { bulletHints, dateRange, orderEntries } from "./cv";

describe("CV builder", () => {
  it("formats date ranges", () => {
    expect(dateRange("2022-09-01", "2024-06-01")).toBe("Sep 2022 – Jun 2024");
    expect(dateRange("2025-06-01", null)).toBe("Jun 2025 – present");
    expect(dateRange(null, "2024-06-01")).toBe("Jun 2024");
    expect(dateRange(null, null)).toBe("");
  });

  it("asks questions about weak bullets and leaves strong ones alone", () => {
    expect(bulletHints("Built a dashboard used by 40 staff each week", "experience")).toEqual([]);
    expect(bulletHints("Responsible for various reports", "experience")).toEqual([
      "What did you do yourself? Start with the action you took.",
      "Can you add a number: how many, how much, how often, or by how much it changed?",
      "Which ones exactly? Name them.",
    ]);
    expect(bulletHints("word ".repeat(31), "projects")).toContain("Could this be one line? Readers skim.");
  });

  it("does not ask for numbers in a skills list", () => {
    expect(bulletHints("Python, SQL, R, Tableau", "skills")).toEqual([]);
  });

  it("orders sections, then current and recent entries first", () => {
    const e = (section: string, start: string | null, end: string | null, id: string) => ({ section, start_month: start, end_month: end, id });
    const sorted = orderEntries([
      e("skills", null, null, "s"),
      e("experience", "2020-01-01", "2021-01-01", "old"),
      e("education", "2019-09-01", "2023-06-01", "degree"),
      e("experience", "2025-06-01", null, "current"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["degree", "current", "old", "s"]);
  });
});
