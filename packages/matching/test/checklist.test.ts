import { describe, expect, it } from "vitest";
import { buildChecklist, type ChecklistDeadline } from "../src";
import { NOW, requirement } from "./fixtures";

const deadline = (dueAt: string, extra: Partial<ChecklistDeadline> = {}): ChecklistDeadline => ({
  id: `dl-${dueAt}`,
  status: "verified",
  applicantCategory: "all",
  kind: "application",
  precision: "date",
  dueAt,
  owningSystem: "direct",
  ...extra,
});

describe("buildChecklist", () => {
  const reqs = [
    requirement({ kind: "entry_qualification", qualification: "bachelor_4yr", minGradeText: "60%" }),
    requirement({ kind: "language_test", exam: "ielts_academic", minTotal: 6.5 }),
    requirement({ kind: "language_test", exam: "pte_academic", minTotal: 58 }),
    requirement({ kind: "admissions_test", exam: "gre", testPolicy: "optional" }),
    requirement({ kind: "recommendation_letters", countRequired: 2 }),
    requirement({ kind: "statement", wordLimit: 1000 }),
    requirement({ kind: "language_test", exam: "ielts_ukvi", minTotal: 6, applicantCategory: "uk_home" }),
  ];

  it("turns requirements and deadlines into dated steps", () => {
    const items = buildChecklist(reqs, [deadline("2027-01-15T05:00:00Z")], ["all", "international"], NOW);
    expect(items.map((i) => i.title)).toEqual([
      "Get your transcript and qualification certificate",
      "Send one accepted English test score",
      "Ask 2 referees for recommendation letters",
      "Write your statement of purpose or personal statement (up to 1000 words)",
      "Submit the application",
    ]);
    expect(items[1]!.details).toBe("IELTS Academic 6.5, PTE Academic 58");
    expect(items.every((i) => i.dueAt === "2027-01-15T05:00:00Z")).toBe(true);
  });

  it("skips optional tests and other applicant categories", () => {
    const titles = buildChecklist(reqs, [], ["all", "international"], NOW).map((i) => i.title).join(" ");
    expect(titles).not.toMatch(/GRE/);
    expect(titles).not.toMatch(/UKVI/);
  });

  it("adds the steps of the owning application system", () => {
    const items = buildChecklist([], [deadline("2027-05-31T00:00:00Z", { owningSystem: "uni_assist" })], ["all"], NOW);
    expect(items[0]).toMatchObject({ kind: "system_step", link: "https://www.uni-assist.de/en/" });
  });

  it("ignores deadlines that have passed", () => {
    const items = buildChecklist([], [deadline("2026-01-15T00:00:00Z"), deadline("2027-01-15T00:00:00Z", { kind: "funding" })], ["all"], NOW);
    expect(items.map((i) => i.title)).toEqual(["Funding deadline"]);
    expect(items[0]!.dueAt).toBe("2027-01-15T00:00:00Z");
  });
});
