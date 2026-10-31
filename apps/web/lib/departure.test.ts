import { describe, expect, it } from "vitest";
import { courseStart, departureTimeline, groupByMonth, monthName } from "./departure";

const visa = { id: "11111111-1111-4111-8111-111111111111", kind: "visa_info", title: "UK Student visa (GOV.UK)", details: null, link: "https://www.gov.uk/student-visa", status: "verified" };
const aps = { id: "22222222-2222-4222-8222-222222222222", kind: "aps_certificate", title: "APS certificate", details: "Needed before the visa.", link: "https://aps-india.de/", status: "unverified" };

describe("courseStart", () => {
  it("uses the published start date", () => {
    expect(courseStart({ starts_on: "2027-09-20", intake_year: 2027, intake_term: "fall" })).toEqual({ date: "2027-09-20", approximate: false });
  });
  it("falls back to the intake term, labelled approximate", () => {
    expect(courseStart({ starts_on: null, intake_year: 2027, intake_term: "winter" })).toEqual({ date: "2027-10-01", approximate: true });
    expect(courseStart({ starts_on: null, intake_year: 2028, intake_term: "semester_1" })).toEqual({ date: "2028-02-15", approximate: true });
  });
  it("gives up on an unknown term", () => {
    expect(courseStart({ starts_on: null, intake_year: 2027, intake_term: "any" })).toBeNull();
  });
});

describe("departureTimeline", () => {
  it("counts due dates back from the start, earliest first", () => {
    const tasks = departureTimeline([], "2027-09-20");
    expect(tasks[0]).toMatchObject({ key: "accommodation", due: "2027-06-28" });
    expect(tasks.find((t) => t.key === "documents")?.due).toBe("2027-09-06");
    expect(tasks.at(-1)).toMatchObject({ key: "arrival", due: "2027-09-27" });
  });
  it("adds the destination's rules with their links and status", () => {
    const tasks = departureTimeline([visa, aps], "2027-09-20");
    expect(tasks[0]).toMatchObject({ key: `rule:${aps.id}`, link: aps.link, status: "unverified", due: "2027-04-05" });
    const v = tasks.find((t) => t.key === `rule:${visa.id}`)!;
    expect(v.due).toBe("2027-06-28");
    expect(v.body).toMatch(/official page/);
  });
  it("uses a verified rule's own lead time from the official page, and our default otherwise (J5.5)", () => {
    const ins = { id: "00000000-0000-0000-0000-00000000000c", kind: "health_insurance", title: "Health insurance", details: null, link: "https://example.org/ins", status: "verified", lead_days: 30 };
    const sourced = departureTimeline([ins], "2027-09-20").find((t) => t.key === `rule:${ins.id}`)!;
    expect(sourced).toMatchObject({ due: "2027-08-21", leadFromSource: true });
    const unverified = departureTimeline([{ ...ins, status: "unverified" }], "2027-09-20").find((t) => t.key === `rule:${ins.id}`)!;
    expect(unverified.due).toBe("2027-07-26");
    expect(unverified.leadFromSource).toBeUndefined();
  });
  it("leaves dates empty without a start", () => {
    expect(departureTimeline([visa], null).every((t) => t.due === null)).toBe(true);
  });
  it("only uses keys the database accepts", () => {
    for (const t of departureTimeline([visa, aps], null)) expect(t.key).toMatch(/^([a-z_]{1,40}|rule:[0-9a-f-]{36})$/);
  });
});

describe("groupByMonth", () => {
  it("groups consecutive tasks by due month", () => {
    const groups = groupByMonth(departureTimeline([], "2027-09-20"));
    expect(groups.map((g) => g.month)).toEqual(["2027-06", "2027-07", "2027-08", "2027-09"]);
    expect(monthName("2027-06")).toBe("June 2027");
  });
});
