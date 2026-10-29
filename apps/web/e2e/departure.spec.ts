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
