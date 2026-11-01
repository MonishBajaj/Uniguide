// M7 A2.2: guided apply on the practice portal, with the real extension. The run fills what it's sure of and
// presses Continue through the guard; the student does what only they can, and the run stops at the review page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { APPLICANT, sql } from "./helpers";
import { PORTAL, connect, eventLines, freshPortal, launch, openPanel, resetApplicantForAssist, type Rig } from "./extension-helpers";

test.describe.configure({ mode: "serial" });

let rig: Rig;
let ctx: BrowserContext;
let portal: Page;
let panel: Page;

test.beforeAll(async () => {
  resetApplicantForAssist();
  rig = await launch("guided");
  ctx = rig.ctx;
  await connect(ctx);
});

test.afterAll(async () => {
  await rig?.close();
  resetApplicantForAssist();
  sql(`delete from test_scores where user_id = '${APPLICANT}'; delete from cv_entries where user_id = '${APPLICANT}'`);
});

const status = () => panel.locator("#guided-status");
const runCard = () => panel.locator("#guided-run");

/** Wait until the run has paused, and for the reason given. */
async function pausedFor(reason: string) {
  await expect(runCard()).toHaveAttribute("data-status", "paused", { timeout: 20_000 });
  await expect(status()).toHaveAttribute("data-reason", reason);
}

async function axe(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    out.push(...violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${width}px ${v.id}: ${v.help}`));
  }
  return out;
}

test("a full run fills and moves on by itself, pauses where only the student can act, and stops at the review page", async () => {
  sql(`delete from assist_runs where user_id = '${APPLICANT}'`);
  portal = await freshPortal(ctx, portal);
  panel = await openPanel(ctx);

  // The start screen: what it will and won't do.
  const start = panel.locator("#guided-start");
  await expect(start).toContainText("It never submits, pays, signs, certifies or makes a declaration.");
  await expect(start).toContainText("you'll copy your own final draft and paste it yourself");
  expect(await axe(panel)).toEqual([]);
  await panel.getByRole("button", { name: "Start guided apply" }).click();

  // Your details: it opens the application, fills the facts, and pauses for the names it never fills (R15).
  await pausedFor("student");
  await expect(portal).toHaveURL(`${PORTAL}/apply/about-you`);
  await expect(portal.locator("#field-email")).toHaveValue("applicant@uniguide.local");
  await expect(portal.locator("#field-country_of_residence")).toHaveValue("IN");
  await expect(runCard()).toContainText("Given names");
  expect(await axe(panel)).toEqual([]);
  await portal.fill("#field-given_names", "Test");
  await portal.fill("#field-family_name", "Student");
  await portal.fill("#field-date_of_birth", "2007-05-01");
  await panel.getByRole("button", { name: "Resume" }).click();

  // School: the facts as the portal names them, then the school's name is the student's.
  await pausedFor("student");
  await expect(portal).toHaveURL(`${PORTAL}/apply/schooling`);
  await expect(portal.locator("#field-qualification")).toHaveValue("bachelor_4yr");
  await expect(portal.locator("#field-grade_value")).toHaveValue("8.4");
  await portal.fill("#field-school_name", "City School");
  await portal.check("#field-still_studying-no");
  await panel.getByRole("button", { name: "Resume" }).click();

  // Tests and activities need nothing from the student: answering "yes" shows the test details, which it fills too.
  // The statement has no final draft, so it pauses there.
  await pausedFor("student");
  await expect(portal).toHaveURL(`${PORTAL}/apply/statement`);
  await portal.fill("#field-statement", "My own words about why I want to study this course.");
  await panel.getByRole("button", { name: "Resume" }).click();

  // The security check, the fee and the declaration: the student does each one and presses the page's button.
  await pausedFor("captcha");
  await expect(portal).toHaveURL(`${PORTAL}/apply/security-check`);
  await portal.fill("#field-check_word", "PRACTICE");
  await portal.click("#save-continue");
  await portal.waitForURL(`${PORTAL}/apply/fee`);
  await panel.getByRole("button", { name: "Resume" }).click();

  await pausedFor("payment");
  await portal.check("#field-fee_waiver");
  await portal.fill("#field-fee_waiver_reason", "Synthetic test reason");
  await portal.click("#save-continue");
  await portal.waitForURL(`${PORTAL}/apply/declaration`);
  await panel.getByRole("button", { name: "Resume" }).click();

  await pausedFor("declaration");
  await portal.check("#field-declare");
  await portal.fill("#field-signed_name", "Test Student");
  await portal.click("#sign-continue");
  await portal.waitForURL(`${PORTAL}/review`);
  await panel.getByRole("button", { name: "Resume" }).click();

  // The review page: it stops, and nothing presses Submit.
  await expect(runCard()).toHaveAttribute("data-status", "at_review");
  await expect(status()).toContainText("submit it yourself");
  await portal.waitForTimeout(1500);
  await expect(portal).toHaveURL(`${PORTAL}/review`);
  await expect(portal.locator("#review-table")).toContainText("ielts_academic");
  await expect(portal.locator("#review-table")).toContainText("Robotics club lead");

  expect(sql(`select feature || ':' || coalesce(outcome, 'open') from assist_runs where user_id = '${APPLICANT}' and feature = 'guided'`)).toBe("guided:review");
  const events = eventLines();
  expect(events.filter((e) => e.startsWith("paused:")).map((e) => e.split(":")[2])).toEqual(["student", "student", "student", "captcha", "payment", "declaration"]);
  // It pressed the dashboard's way in, then Continue on your details, school, tests, activities and the statement.
  // The student pressed Continue on the security check, the fee and the declaration themselves.
  expect(events.filter((e) => e.startsWith("navigated:"))).toHaveLength(6);
  expect(events.filter((e) => e.startsWith("filled:")).map((e) => e.split(":")[1])).toEqual(
    expect.arrayContaining(["contact.email", "education.grade.value", "tests.english.exam", "tests.english.total", "activities[].role"]),
  );
  expect(events.some((e) => e.startsWith("blocked:"))).toBe(false);
  expect(sql(`select count(*) from applications where user_id = '${APPLICANT}' and status = 'submitted'`)).toBe("0");
});

test("a required value missing from the profile pauses the run, and says which field", async () => {
  sql(`update profiles set grade_value = null, grade_text = null where user_id = '${APPLICANT}'`);
  portal = await freshPortal(ctx, portal);
  await portal.goto(`${PORTAL}/apply/schooling`);
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();
  await panel.getByRole("button", { name: "Start guided apply" }).click();
  await pausedFor("no_value");
  await expect(status()).toContainText("Your profile doesn't have an answer this page needs.");
  await expect(runCard()).toContainText("Your overall grade");
  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(runCard()).toHaveAttribute("data-status", "stopped");
  sql(`update profiles set grade_value = 8.4 where user_id = '${APPLICANT}'`);
});

test("a page that no longer matches the map pauses before anything is filled", async () => {
  portal = await freshPortal(ctx, portal);
  await fetch(`${PORTAL}/__variant?page=about-you&variant=changed`, { method: "POST" });
  await portal.goto(`${PORTAL}/apply/about-you`);
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();
  await panel.getByRole("button", { name: "Start guided apply" }).click();
  await pausedFor("page_differs");
  await expect(status()).toContainText("This page looks different from what we expected.");
  await expect(portal.locator("#field-email")).toHaveValue("");
  await panel.getByRole("button", { name: "Stop" }).click();
  await fetch(`${PORTAL}/__variant?page=about-you`, { method: "POST" });
});

test("Stop takes effect before the next action: nothing happens after it", async () => {
  sql(`delete from assist_runs where user_id = '${APPLICANT}'`);
  portal = await freshPortal(ctx, portal);
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();
  await panel.getByRole("button", { name: "Start guided apply" }).click();
  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(runCard()).toHaveAttribute("data-status", "stopped");
  const url = portal.url();
  const before = eventLines().length;
  await portal.waitForTimeout(2500);
  expect(portal.url()).toBe(url);
  expect(eventLines()).toHaveLength(before);
  // The run is ended, and no event was logged after it ended.
  expect(sql(`select outcome from assist_runs where user_id = '${APPLICANT}' and feature = 'guided'`)).toBe("stopped");
  expect(
    sql(`select count(*) from assist_events e join assist_runs r on r.id = e.run_id where r.user_id = '${APPLICANT}' and e.at > r.ended_at`),
  ).toBe("0");
});
