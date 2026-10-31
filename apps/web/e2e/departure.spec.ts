import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "tu-beispielstadt-msc-informatik";

test.beforeEach(() => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status, decision)
       select '${STUDENT}', c.id, 'decided', 'admitted' from program_cycles c join programs p on p.id = c.program_id
       where p.slug = '${SLUG}' and c.is_current`);
});

test("10.1 accepting an offer gives a dated pre-departure checklist with the destination's rules", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/offers");
  await page.getByRole("link", { name: "Plan what to arrange before you leave" }).click();
  await page.waitForURL("**/app/departure");
  await expect(page.getByRole("heading", { name: "Which offer are you taking?" })).toBeVisible();

  // Accept from the application page instead.
  const appId = sql(`select a.id from applications a where a.user_id = '${STUDENT}'`);
  await page.goto(`/app/tracker/${appId}`);
  await page.click('button:has-text("I\'m accepting this offer")');
  await expectStored(`select count(*) from applications where user_id = '${STUDENT}' and offer_accepted_at is not null`, "1");
  await page.getByRole("link", { name: "See what to arrange before you leave" }).click();
  await page.waitForURL("**/app/departure");

  await expect(page.getByText("The course starts on 1 Oct 2027.")).toBeVisible();
  // German rules for a student living in India, earliest first: APS, then the visa pages.
  const titles = await page.locator("li h3").allTextContents();
  expect(titles[0]).toBe("APS certificate for applicants with Indian qualifications");
  expect(titles).toContain("Visa for studying in Germany (Make it in Germany, Federal Government)");
  expect(titles).not.toContain("UK Student visa (GOV.UK)");
  expect(titles.at(-1)).toBe("Register after you arrive");
  await expect(page.locator("section[aria-label='July 2027'] h3", { hasText: "Arrange somewhere to live" })).toBeVisible();
  await expect(page.getByText("0 of 10 done")).toBeVisible();

  await page.getByRole("button", { name: "Arrange somewhere to live: mark done" }).click();
  await expect(page.getByRole("button", { name: "Arrange somewhere to live: done, mark not done" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 of 10 done")).toBeVisible();
  await expectStored(`select task_key from departure_tasks where user_id = '${STUDENT}'`, "accommodation");

  // The calendar has the open tasks only, as all-day events.
  const ics = await (await page.request.get("/app/departure/calendar.ics")).text();
  expect(ics).toContain("SUMMARY:Arrange health insurance");
  expect(ics).toContain("DTSTART;VALUE=DATE:20270806");
  expect(ics).not.toContain("Arrange somewhere to live");
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(9);

  await page.getByRole("button", { name: "Arrange somewhere to live: done, mark not done" }).click();
  await expect(page.getByText("0 of 10 done")).toBeVisible();
  await expectStored(`select count(*) from departure_tasks where user_id = '${STUDENT}'`, "0");

  await page.click('button:has-text("Choose a different offer")');
  await expect(page.getByRole("heading", { name: "Which offer are you taking?" })).toBeVisible();
});

test("J5.5 an admin's verified health insurance rule with a lead time dates the task and brings its step", async ({ browser }) => {
  sql(`delete from country_rules where title = 'E2E health insurance for students'`);
  sql(`update applications set offer_accepted_at = now() where user_id = '${STUDENT}'`);
  try {
    const admin = await signIn(browser, "admin@uniguide.local");
    await admin.goto("/admin/rules");
    const form = admin.locator("form", { has: admin.getByRole("heading", { name: "Add a rule" }) });
    await form.getByLabel("Destination (two letters)").fill("DE");
    await form.getByLabel("Kind").selectOption("health_insurance");
    await form.getByLabel("Title").fill("E2E health insurance for students");
    await form.getByLabel("Official page").fill("https://example.org/e2e-insurance");
    await form.getByLabel("Verbatim quote from the page").fill("Students must have health insurance to enrol.");
    await form.getByLabel("Days ahead to start (lead time)").fill("30");
    await form.getByLabel("The page's words for that lead time").fill("Apply at least four weeks before your course begins.");
    await form.getByRole("button", { name: "Add rule" }).click();
    const row = admin.getByRole("listitem").filter({ hasText: "E2E health insurance for students" });
    await expect(row).toContainText("start 30 days ahead");

    // Unverified: our default timing, and no step.
    const page = await signIn(browser, "student@uniguide.local");
    await page.goto("/app/steps");
    await expect(page.getByRole("article").getByRole("heading", { name: "Arrange health insurance", exact: true })).toHaveCount(0);

    await row.getByRole("button", { name: "Verify" }).click();
    await expect(row.getByRole("button", { name: "Verify" })).toHaveCount(0);

    await page.goto("/app/departure");
    const task = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "E2E health insurance for students" }) });
    await expect(task).toContainText("By 1 Sept");
    await expect(task).toContainText("The timing comes from the official page.");
    await page.goto("/app/steps");
    await expect(page.getByRole("article").getByRole("heading", { name: "Arrange health insurance", exact: true })).toBeVisible();
  } finally {
    sql(`delete from country_rules where title = 'E2E health insurance for students'`);
  }
});
