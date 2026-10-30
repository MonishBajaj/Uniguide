import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M3 (J3.4): "not taken yet" completes the test step; booking a date completes "Book your test".
// The seed student's IELTS score is removed for these tests and put back afterwards.
const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from test_scores where user_id = '${STUDENT}';
       delete from test_plans where user_id = '${STUDENT}';
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'shortlisted' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current`);
});

test.afterEach(() => {
  sql(`delete from test_plans where user_id = '${STUDENT}';
       delete from test_scores where user_id = '${STUDENT}';
       insert into test_scores (user_id, exam, total, taken_on, sections) values ('${STUDENT}', 'ielts_academic', 7.5, '2026-09-01', '{}')`);
});

const step = (page: import("@playwright/test").Page, title: string) => page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });

async function savePlan(page: import("@playwright/test").Page, status: "Not taken yet" | "Booked", date = "") {
  const plans = page.locator("#test-plans");
  await plans.locator("select[name=exam]").selectOption("ielts_academic");
  await plans.locator("select[name=status]").selectOption({ label: status });
  if (date) await plans.locator("input[name=booked_for]").fill(date);
  await plans.getByRole("button", { name: "Save plan" }).click();
}

test("saying the test is not taken yet completes the test score step", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/steps");
  await expect(step(page, "Add your test scores")).toHaveCount(1);

  await page.goto("/app/profile#test-plans");
  await savePlan(page, "Not taken yet");
  await expect(page.locator("#test-plans").getByRole("listitem")).toHaveText(/IELTS Academic: not taken yet/);

  await page.goto("/app/steps");
  await expect(step(page, "Add your test scores")).toHaveCount(0);
});

test("a course being prepared asks for a booking, which a booked date completes", async ({ browser }) => {
  sql(`update applications set status = 'preparing' where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/steps");
  await step(page, "Book your test").getByRole("link", { name: /^Start this step/ }).click();
  await expect(page).toHaveURL(/\/app\/profile#test-plans$/);

  // A booking needs its date.
  await savePlan(page, "Booked");
  await expect(page.getByRole("alert").filter({ hasText: "give the date" })).toBeVisible();

  const date = `${new Date().getFullYear() + 1}-01-10`;
  await savePlan(page, "Booked", date);
  await expect(page.locator("#test-plans").getByRole("listitem")).toHaveText(new RegExp(`IELTS Academic: booked for ${date}`));
  expect(sql(`select status || ',' || booked_for from test_plans where user_id = '${STUDENT}'`)).toBe(`booked,${date}`);

  await page.goto("/app/steps");
  await expect(step(page, "Book your test")).toHaveCount(0);
});
