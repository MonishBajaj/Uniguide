// The guided-apply runner (plan A2.2) with a fake portal: the order it acts in, that Stop and Pause land
// before the next action, and what it logs.
import { describe, expect, it } from "vitest";
import { planPage, type PageId } from "@uniguide/portal-adapters";
import { practice } from "@uniguide/portal-adapters/practice";
import type { FieldView, FillResult } from "../src/messages";
import { GuidedRunner, type GuidedDeps, type GuidedScan } from "../src/panel/guided";
import { profile } from "./helpers";

const field = (key: string, over: Partial<FieldView> = {}): FieldView => ({
  key,
  name: key.replace("field-", ""),
  control: "text",
  label: key,
  role: null,
  confidence: 1,
  via: "map",
  action: "fill",
  required: true,
  visible: true,
  hasValue: false,
  ...over,
});

const PAGES: Record<string, { page: PageId; fields: FieldView[] }> = {
  "about-you": {
    page: { kind: "form", pageId: "about-you", matchesMap: true },
    fields: [field("field-email", { role: "contact.email", control: "email" })],
  },
  schooling: {
    page: { kind: "form", pageId: "schooling", matchesMap: true },
    fields: [field("field-grade_value", { role: "education.grade.value", action: "confirm" })],
  },
  review: { page: { kind: "review", matchesMap: true }, fields: [] },
};

/** A fake portal that moves to the next page when Continue is pressed, and records everything done to it. */
function fakePortal(order = ["about-you", "schooling", "review"], over: Partial<GuidedDeps> = {}, pages = structuredClone(PAGES)) {
  let at = 0;
  const done: string[] = [];
  const logged: string[] = [];
  const deps: GuidedDeps = {
    scan: async (): Promise<GuidedScan> => {
      const p = pages[order[at]!]!;
      return { page: p.page, fields: p.fields, errors: false };
    },
    plan: (fields, skipped) => planPage(fields, profile(), practice, skipped),
    fill: async (f): Promise<FillResult> => {
      done.push(`fill ${f.key}=${f.value}`);
      // Like a real page: the field now holds the value.
      const page = pages[order[at]!]!;
      page.fields = page.fields.map((x) => (x.key === f.key ? { ...x, hasValue: true } : x));
      return { status: "filled" };
    },
    press: async (control) => {
      done.push(`press ${control}`);
      at++;
      return { status: "pressed" };
    },
    waitForPage: async () => true,
    log: (kind, role, page, _source, reason) => logged.push([kind, role ?? "-", page ?? "-", reason ?? "-"].join(":")),
    changed: () => {},
    ...over,
  };
  return { deps, done, logged, at: () => order[at] };
}

describe("a run with nothing to pause for", () => {
  it("fills each page, presses Continue through the guard, and stops at the review page", async () => {
    const p = fakePortal();
    const r = new GuidedRunner(p.deps);
    await r.start();
    expect(p.done).toEqual(["fill field-email=applicant@uniguide.local", "press continue", "fill field-grade_value=8.4", "press continue"]);
    expect(r.run.status).toBe("at_review");
    expect(p.logged).toEqual([
      "filled:contact.email:about-you:-",
      "navigated:-:about-you:-",
      "filled:education.grade.value:schooling:-",
      "navigated:-:schooling:-",
    ]);
  });
});

describe("pauses", () => {
  it("pauses after filling what it can, and carries on once the student has filled the rest", async () => {
    const pages = structuredClone(PAGES);
    pages["about-you"]!.fields.push(field("field-given_names", { role: "person.given_names", action: "student" }));
    const p = fakePortal(undefined, {}, pages);
    const r = new GuidedRunner(p.deps);
    await r.start();
    expect(r.run).toMatchObject({ status: "paused", pause: { reason: "student", fields: ["field-given_names"] } });
    expect(p.done).toEqual(["fill field-email=applicant@uniguide.local"]);
    expect(p.logged.at(-1)).toBe("paused:person.given_names:about-you:student");

    // The student fills in their name, and the email is already there now.
    pages["about-you"]!.fields = pages["about-you"]!.fields.map((f) => ({ ...f, hasValue: true }));
    await r.resume();
    expect(p.logged).toContain("resumed:-:about-you:-");
    expect(r.run.status).toBe("at_review");
  });

  it("pauses when the guard won't press Continue, and logs the block", async () => {
    const p = fakePortal(undefined, { press: async () => ({ status: "blocked", why: "submit_unsafe" }) });
    const r = new GuidedRunner(p.deps);
    await r.start();
    expect(r.run).toMatchObject({ status: "paused", pause: { reason: "guard", detail: "submit_unsafe" } });
    expect(p.logged).toContain("blocked:-:about-you:guard");
  });

  it("pauses when the next page doesn't arrive", async () => {
    const p = fakePortal(undefined, { waitForPage: async () => false });
    const r = new GuidedRunner(p.deps);
    await r.start();
    expect(r.run).toMatchObject({ status: "paused", pause: { reason: "unexpected", detail: "no_next_page" } });
  });

  it("logs a skipped field, and then doesn't pause for it", async () => {
    const pages = structuredClone(PAGES);
    pages["about-you"]!.fields.push(field("field-given_names", { role: "person.given_names", action: "student" }));
    const p = fakePortal(undefined, {}, pages);
    const r = new GuidedRunner(p.deps);
    await r.start();
    r.skip("field-given_names");
    expect(p.logged).toContain("skipped:person.given_names:about-you:student");
    await r.resume();
    expect(r.run.status).toBe("at_review");
  });

  it("re-plans after filling, when a fill reveals more fields", async () => {
    const tests = {
      page: { kind: "form" as const, pageId: "tests", matchesMap: true },
      fields: [field("english_test_taken", { role: "tests.english.taken", control: "radio", action: "confirm", options: [{ value: "yes", text: "Yes" }, { value: "no", text: "No" }] })],
    };
    const prof = profile({ testScores: [{ id: "t", exam: "ielts_academic", version: null, total: 7.5, sections: null, takenOn: null }] });
    const p = fakePortal(["tests", "review"], {
      scan: async () => (p.at() === "tests" ? { ...tests, errors: false } : { ...PAGES.review!, errors: false }),
      plan: (fields, skipped) => planPage(fields, prof, practice, skipped),
      fill: async (f) => {
        p.done.push(`fill ${f.key}=${f.value}`);
        tests.fields = tests.fields.map((x) => (x.key === f.key ? { ...x, hasValue: true } : x));
        if (f.key === "english_test_taken") {
          tests.fields = [
            { ...tests.fields[0]!, hasValue: true },
            field("field-english_overall", { role: "tests.english.total", action: "confirm" }),
          ];
        }
        return { status: "filled" };
      },
    });
    const r = new GuidedRunner(p.deps);
    await r.start();
    expect(p.done).toEqual(["fill english_test_taken=yes", "fill field-english_overall=7.5", "press continue"]);
    expect(r.run.status).toBe("at_review");
  });
});

describe("essays (A2.3)", () => {
  it("pauses at an essay with a final draft and a verified 'allows', and pastes nothing by itself", async () => {
    const statement = {
      page: { kind: "form" as const, pageId: "statement", matchesMap: true },
      fields: [field("field-statement", { role: "essay.personal_statement", control: "textarea", action: "confirm", wordLimit: 650 })],
    };
    const draft = { documentId: "d", kind: "personal_statement", title: null, question: null, versionId: "v", wordCount: 100 };
    const p = fakePortal(["statement", "review"], {
      scan: async () => (p.at() === "statement" ? { ...statement, errors: false } : { ...PAGES.review!, errors: false }),
      plan: (fields, skipped) => planPage(fields, profile({ aiPolicy: "allows", finalDrafts: [draft] }), practice, skipped),
    });
    const r = new GuidedRunner(p.deps);
    await r.start();
    expect(r.run).toMatchObject({ status: "paused", pause: { reason: "student", fields: ["field-statement"] } });
    expect(p.done).toEqual([]);
  });
});

describe("Stop and Pause land before the next action", () => {
  it("Stop pressed during a fill: that fill finishes, nothing after it happens", async () => {
    const pages = structuredClone(PAGES);
    pages["about-you"]!.fields.push(field("field-country_of_residence", { role: "contact.residence_country", control: "select", options: [{ value: "IN", text: "India" }] }));
    let r!: GuidedRunner;
    const p = fakePortal(undefined, {
      scan: async () => ({ ...pages[p.at()!]!, errors: false }),
      fill: async (f) => {
        p.done.push(`fill ${f.key}`);
        r.stop(); // the student presses Stop while the first fill is happening
        return { status: "filled" };
      },
    });
    r = new GuidedRunner(p.deps);
    await r.start();
    expect(p.done).toEqual(["fill field-email"]);
    expect(r.run.status).toBe("stopped");
  });

  it("Pause pressed while Continue is about to be pressed: Continue isn't pressed", async () => {
    let r!: GuidedRunner;
    const p = fakePortal(undefined, {
      fill: async (f) => {
        p.done.push(`fill ${f.key}`);
        r.pause();
        return { status: "filled" };
      },
    });
    r = new GuidedRunner(p.deps);
    await r.start();
    expect(p.done).toEqual(["fill field-email"]);
    expect(r.run.status).toBe("paused");
  });

  it("a stopped run does nothing more, whatever is pressed", async () => {
    const p = fakePortal();
    const r = new GuidedRunner(p.deps);
    r.stop();
    await r.start();
    await r.resume();
    expect(p.done).toEqual([]);
  });
});

describe("handing back", () => {
  it("logs taking over, and restarts from the current page", async () => {
    const pages = structuredClone(PAGES);
    pages["about-you"]!.fields.push(field("field-given_names", { role: "person.given_names", action: "student" }));
    const p = fakePortal(undefined, {}, pages);
    const r = new GuidedRunner(p.deps);
    await r.start();
    r.takeOver();
    expect(r.run.status).toBe("handed_back");
    expect(p.logged).toContain("took_over:-:about-you:-");
    pages["about-you"]!.fields = pages["about-you"]!.fields.map((f) => ({ ...f, hasValue: true }));
    await r.restart();
    expect(r.run.status).toBe("at_review");
  });
});
