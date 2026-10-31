import { expect, test, type Page } from "@playwright/test";
import { STUDENT, audit, resetStudent, signIn, sql } from "./helpers";

// Journey M5: the edges of the journey. J5.3 document readiness and supervisor contacts.
const SLUG = "exampleton-msc-data-science";
const PHD = "e2e-phd-informatics";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from readiness_items where user_id = '${STUDENT}'; delete from supervisor_contacts where user_id = '${STUDENT}';
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current`);
});

test.afterEach(() => {
  sql(`delete from readiness_items where user_id = '${STUDENT}'; delete from supervisor_contacts where user_id = '${STUDENT}';
       delete from institutions where name = 'E2E Research University'`);
});

const steps = async (page: Page) => {
  await page.goto("/app/steps");
  return page.getByRole("article").getByRole("heading").allTextContents();
};

test("the passport step goes once a far enough expiry is saved", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  expect(await steps(page)).toContain("Check your passport is valid");
  await page.getByRole("article").filter({ hasText: "Check your passport is valid" }).getByRole("link", { name: /^Start this step/ }).click();
  await expect(page).toHaveURL(/\/app\/profile#readiness$/);
  const docs = page.getByRole("region", { name: "Documents" });
  await docs.getByLabel("Passport valid until").fill(`${new Date().getFullYear() + 6}-01-01`);
  await docs.getByLabel("My transcripts are ready").check();
  await docs.getByRole("button", { name: "Save" }).click();
  await expect(docs.getByLabel("My transcripts are ready")).toBeChecked();
  expect(await steps(page)).not.toContain("Check your passport is valid");
});

test("a doctorate applicant logs a supervisor contact on the application, and the step goes", async ({ browser }) => {
  sql(`with i as (insert into institutions (name, country) values ('E2E Research University', 'GB') returning id),
       p as (insert into programs (institution_id, slug, title, level, published) select id, '${PHD}', 'PhD Informatics', 'doctorate', true from i returning id),
       c as (insert into program_cycles (program_id, label, intake_year, intake_term, is_current) select id, '2027-autumn', 2027, 'autumn', true from p returning id)
       insert into applications (user_id, cycle_id, status) select '${STUDENT}', id, 'preparing' from c;
       update profiles set target_levels = '{master,doctorate}', research_interests = 'Graph learning' where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  expect(await steps(page)).toContain("Contact potential supervisors");
  await page.getByRole("article").filter({ hasText: "Contact potential supervisors" }).getByRole("link", { name: /^Start this step/ }).click();
  await expect(page).toHaveURL(/\/app\/tracker\/[0-9a-f-]+#supervisors$/);
  const log = page.getByRole("region", { name: "Supervisor contacts" });
  await log.getByLabel("Name").fill("Prof. Rao");
  await log.getByLabel("Contacted on").fill("2026-10-15");
  await log.getByLabel("Reply").selectOption("positive");
  await log.getByRole("button", { name: "Log this contact" }).click();
  await expect(log.getByRole("listitem")).toContainText("Prof. Rao, E2E Research University");
  await expect(log.getByRole("listitem")).toContainText("Positive");
  expect(await steps(page)).not.toContain("Contact potential supervisors");

  const found = await audit(page, page.url());
  expect(found, found.join("\n")).toEqual([]);
});

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`the profile with documents has no serious accessibility violations at ${width}px`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    await page.setViewportSize({ width, height });
    const found = await audit(page, "/app/profile");
    expect(found, found.join("\n")).toEqual([]);
  });
}
