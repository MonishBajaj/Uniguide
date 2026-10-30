import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M3 (J3.2): "I'm applying to this" moves a shortlisted course to preparing in one click.
const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`insert into shortlists (user_id, program_id) select '${STUDENT}', id from programs where slug = '${SLUG}';
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'shortlisted' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current;
       insert into checklist_items (application_id, user_id, title, kind)
         select id, user_id, 'Transcript', 'requirement' from applications where user_id = '${STUDENT}'`);
});

const status = () => sql(`select status from applications where user_id = '${STUDENT}'`);

test("I'm applying on a shortlist card moves the course to stage 4, with its checklist as the next step", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/shortlist");
  await page.getByRole("button", { name: /^I'm applying to this : MSc Data Science/ }).click();

  await expect(page).toHaveURL(/\/app\/tracker\/[0-9a-f-]+\?applying=1#checklist$/);
  await expect(page.getByRole("status").filter({ hasText: "You're applying. Here's the checklist." })).toBeVisible();
  expect(status()).toBe("preparing");

  await page.goto("/app");
  await expect(page.getByText("You're in stage 4 of 7: Prepare.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Work through the checklist for MSc Data Science/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Decide which courses you're applying to" })).toHaveCount(0);

  await page.goto("/app/tracker");
  await expect(page.getByRole("region", { name: /^Preparing/ })).toContainText("MSc Data Science");

  // The shortlist card now opens the checklist instead of offering the button again.
  await page.goto("/app/shortlist");
  await expect(page.getByRole("button", { name: /^I'm applying to this/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "You're applying · Open the checklist" })).toBeVisible();
});

test("the application page asks the same question, and the decide step links to it", async ({ browser }) => {
  sql(`insert into deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
       select c.id, 'all', 'application', 'direct', now() + interval '30 days', 'Europe/London', 'date', 'verified', true
       from program_cycles c join programs p on p.id = c.program_id where p.slug = '${SLUG}' and c.is_current`);
  try {
    const page = await signIn(browser, "student@uniguide.local");
    await page.goto("/app/steps");
    await page.getByRole("article").filter({ hasText: "Decide which courses you're applying to" }).getByRole("link", { name: /^Start this step/ }).click();
    await expect(page).toHaveURL(/\/app\/tracker\/[0-9a-f-]+#applying$/);
    const ask = page.getByRole("region", { name: "Are you applying to this course?" });
    await expect(ask).toBeInViewport();
    await ask.getByRole("button", { name: "I'm applying to this" }).click();
    await expect(page.getByRole("status").filter({ hasText: "You're applying." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Are you applying to this course?" })).toHaveCount(0);
    expect(status()).toBe("preparing");
  } finally {
    sql(`delete from deadlines where due_at > now() + interval '29 days' and due_at < now() + interval '31 days' and kind = 'application'
         and cycle_id in (select c.id from program_cycles c join programs p on p.id = c.program_id where p.slug = '${SLUG}')`);
  }
});

test("a submitted application can't be moved back by the action", async ({ browser }) => {
  sql(`update applications set status = 'submitted' where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/shortlist");
  await expect(page.getByRole("button", { name: /^I'm applying to this/ })).toHaveCount(0);
  const appId = sql(`select id from applications where user_id = '${STUDENT}'`);
  await page.goto(`/app/tracker/${appId}`);
  await expect(page.getByRole("region", { name: "Are you applying to this course?" })).toHaveCount(0);
  expect(status()).toBe("submitted");
});
