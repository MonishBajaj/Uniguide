// M7 A2.2: guided apply on the practice portal, with the real extension. The run fills what it's sure of and
// presses Continue through the guard; the student does what only they can, and the run stops at the review page.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { APPLICANT, sql } from "./helpers";
import { EXTENSION_ID, PORTAL, WEB, connect, eventLines, freshPortal, launch, openPanel, resetApplicantForAssist, type Rig } from "./extension-helpers";

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
  sql(`delete from program_ai_policies where program_id = (select id from programs where slug = 'exampleton-msc-data-science')`);
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

  // The run stays open at review, so the student's submission can be logged on it (A2.4)...
  expect(sql(`select feature || ':' || coalesce(outcome, 'open') from assist_runs where user_id = '${APPLICANT}' and feature = 'guided'`)).toBe("guided:open");
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

  // ...and closing the panel there ends it as having reached review, not as abandoned.
  await panel.close();
  await expect
    .poll(() => sql(`select coalesce(outcome, 'open') from assist_runs where user_id = '${APPLICANT}' and feature = 'guided'`))
    .toBe("review");
  panel = await openPanel(ctx);
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

test("essays: the run offers the student's own final draft, pastes it only when told to, and only where AI help is allowed", async () => {
  const draft = "Why I want to study data science, in my own words.";
  sql(`delete from assist_runs where user_id = '${APPLICANT}'; delete from documents where user_id = '${APPLICANT}'`);
  const docId = sql(`insert into documents (user_id, kind, title) values ('${APPLICANT}', 'personal_statement', 'Personal statement') returning id`).split("\n")[0]!;
  const versionId = sql(`insert into document_versions (document_id, user_id, body, word_count) values ('${docId}', '${APPLICANT}', '${draft}', 10) returning id`).split("\n")[0]!;
  sql(`update documents set final_version_id = '${versionId}' where id = '${docId}';
       insert into program_ai_policies (program_id, policy, status, evidence_quote, verified_at, published)
         select id, 'allows', 'verified', 'Applicants may use AI tools to check their statements.', now(), true
         from programs where slug = 'exampleton-msc-data-science'`);

  // A verified "allows": the run pauses at the statement and offers the draft; nothing is pasted until the student says so.
  portal = await freshPortal(ctx, portal);
  await portal.goto(`${PORTAL}/apply/statement`);
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();
  await expect(panel.locator("#guided-start")).toContainText("pastes it only after you say so");
  await panel.getByRole("button", { name: "Start guided apply" }).click();
  await pausedFor("student");
  await expect(portal.locator("#field-statement")).toHaveValue("");
  await panel.waitForTimeout(1000);
  await expect(portal.locator("#field-statement")).toHaveValue("");
  await panel.getByRole("button", { name: "Paste final draft: Why do you want to study this course?" }).click();
  await expect(portal.locator("#field-statement")).toHaveValue(draft);
  await expect(panel.locator("#guided-essay-field-statement")).toContainText("Pasted");
  expect(await axe(panel)).toEqual([]);
  await panel.getByRole("button", { name: "Resume" }).click();
  await pausedFor("captcha");
  await panel.getByRole("button", { name: "Stop" }).click();
  expect(eventLines()).toContain("pasted_draft:essay.personal_statement:-");

  // The policy unknown again: never pasted, but the student can copy their own draft and paste it themselves.
  sql(`delete from program_ai_policies where program_id = (select id from programs where slug = 'exampleton-msc-data-science')`);
  portal = await freshPortal(ctx, portal);
  await portal.goto(`${PORTAL}/apply/statement`);
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();
  await panel.getByRole("button", { name: "Start guided apply" }).click();
  await pausedFor("student");
  const essay = panel.locator("#guided-essay-field-statement");
  await expect(essay).toContainText("copy your own draft and paste it yourself");
  await expect(panel.getByRole("button", { name: /Paste final draft/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Copy final draft: Why do you want to study this course?" }).click();
  await expect.poll(() => panel.evaluate(() => navigator.clipboard.readText())).toBe(draft);
  await expect(portal.locator("#field-statement")).toHaveValue("");
  await panel.getByRole("button", { name: "Stop" }).click();
  expect(eventLines()).toContain("copied_draft:essay.personal_statement:-");
});

/** The student signs in to UniGuide in the same browser as the extension. */
async function signInToUniguide(): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`);
  await page.fill("input[name=email]", "applicant@uniguide.local");
  await page.fill("input[name=password]", "password123");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(app|parent)(\/|\?|$)/);
  // Chrome stops passing clicks to the tab that just sent a password form; carry on in a fresh tab.
  const web = await ctx.newPage();
  await page.close();
  return web;
}

test("Apply from the tracker: the portal opens, the run reaches review, and once the student submits the tracker shows it, and how", async () => {
  // The whole journey, from the tracker through every page to the confirmation: longer than one page's test.
  test.setTimeout(90_000);
  // The earlier tests' tabs: the panel below must find the portal tab Apply opens, not an older one.
  await panel?.close();
  await portal?.close();
  resetApplicantForAssist();
  await fetch(`${PORTAL}/__reset`, { method: "POST" });
  const appId = sql(`select id from applications where user_id = '${APPLICANT}' limit 1`);
  const web = await signInToUniguide();
  await web.goto(`${WEB}/app/tracker/${appId}`);
  const apply = web.locator("#apply-with-assist");
  await expect(apply).toContainText("You submit it yourself.");
  expect(await axe(web)).toEqual([]);

  const opened = ctx.waitForEvent("page");
  await apply.getByRole("button", { name: "Apply with UniGuide Assist" }).click();
  portal = await opened;
  await expect(apply).toContainText("The portal is open in a new tab.");

  // The student signs in to the portal themselves. Most pages were already answered in an earlier session.
  await portal.waitForURL(`${PORTAL}/sign-in`);
  await portal.fill("#email", "tester@practice.test");
  await portal.fill("#password", "practice-only");
  await portal.click("#sign-in");
  await portal.waitForURL(`${PORTAL}/`);
  await portal.evaluate(async () => {
    const post = (id: string, a: Record<string, string>, action = "continue") =>
      fetch(`/apply/${id}`, { method: "POST", body: new URLSearchParams({ action, ...a }), redirect: "manual" });
    await post("about-you", { given_names: "Test", family_name: "Student", date_of_birth: "2007-05-01" }, "save");
    await post("schooling", { school_name: "City School", qualification: "bachelor_4yr", grade_scale: "gpa_10", grade_value: "8.4", still_studying: "no" });
    await post("tests", { english_test_taken: "no" });
    await post("activities", { activity_1_role: "Robotics club lead" });
    await post("statement", { statement: "My own words." });
    await post("security-check", { check_word: "PRACTICE" });
    await post("fee", { fee_waiver: "on", fee_waiver_reason: "Synthetic test reason" });
    await post("declaration", { declare: "on", signed_name: "Test Student" });
  });
  await portal.reload();

  // The panel picks up the Apply: the application is chosen, and the start screen waits for Start.
  // The tab id comes from the background worker: loading the panel without it would already take the Apply.
  const tabId = await ctx.serviceWorkers()[0].evaluate(async (origin) => {
    const tabs = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id?: number }[]> } } }).chrome.tabs;
    return (await tabs.query({ url: `${origin}/*` }))[0]?.id;
  }, PORTAL);
  panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXTENSION_ID}/panel.html?tab=${tabId}`);
  await expect(panel.locator("#from-tracker")).toBeVisible();
  await expect(panel.locator("select#application")).toHaveCount(0);
  await panel.getByRole("button", { name: "Start guided apply" }).click();

  // It fills the email and country, moves through the answered pages, and pauses for the student's own steps.
  await pausedFor("captcha");
  await portal.click("#save-continue");
  await portal.waitForURL(`${PORTAL}/apply/fee`);
  await panel.getByRole("button", { name: "Resume" }).click();
  await pausedFor("payment");
  await portal.click("#save-continue");
  await portal.waitForURL(`${PORTAL}/apply/declaration`);
  await panel.getByRole("button", { name: "Resume" }).click();
  await pausedFor("declaration");
  await portal.click("#sign-continue");
  await portal.waitForURL(`${PORTAL}/review`);
  await panel.getByRole("button", { name: "Resume" }).click();

  // The review summary: what it filled and where it paused, each linked to its page.
  await expect(runCard()).toHaveAttribute("data-status", "at_review");
  await expect(panel.locator("#summary-filled li")).toHaveText([
    /Your details: Email address/,
    /Your details: Country you live in/,
    /Activities: Activity: organisation/,
  ]);
  await expect(panel.locator("#summary-paused li")).toHaveCount(3);
  expect(await axe(panel)).toEqual([]);
  await panel.getByRole("button", { name: "Go to Your details" }).first().click();
  await portal.waitForURL(`${PORTAL}/apply/about-you`);
  await expect(runCard()).toHaveAttribute("data-status", "at_review");

  // The student goes back and submits. The confirmation page marks the application submitted.
  await portal.goto(`${PORTAL}/review`);
  await portal.click("#submit-application");
  await portal.waitForURL(`${PORTAL}/confirmation`);
  await expect(runCard()).toHaveAttribute("data-status", "finished", { timeout: 15_000 });
  await expect.poll(() => sql(`select status from applications where id = '${appId}'`)).toBe("submitted");
  expect(eventLines().at(-1)).toBe("submitted:-:confirmation_page");
  expect(sql(`select outcome from assist_runs where user_id = '${APPLICANT}' and feature = 'guided'`)).toBe("submitted");

  await web.reload();
  await expect(web.locator("#apply-with-assist")).toHaveCount(0);
  const log = web.getByRole("region", { name: "Assist log" });
  await log.locator("summary").first().click();
  await expect(log).toContainText("Marked as submitted");
  await expect(log).toContainText("confirmation page seen");
  await web.close();
});

test("the Apply button is absent for a portal guided apply doesn't support", async () => {
  resetApplicantForAssist();
  const appId = sql(`select id from applications where user_id = '${APPLICANT}' limit 1`);
  const cycle = sql(`select cycle_id from applications where id = '${appId}'`);
  sql(`update deadlines set owning_system = 'common_app' where cycle_id = '${cycle}'`);
  try {
    const web = await signInToUniguide();
    await web.goto(`${WEB}/app/tracker/${appId}`);
    await expect(web.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(web.locator("#apply-with-assist")).toHaveCount(0);
    await web.close();
  } finally {
    sql(`update deadlines set owning_system = 'direct' where cycle_id = '${cycle}'`);
  }
});
