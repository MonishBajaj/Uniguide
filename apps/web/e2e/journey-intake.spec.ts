import { expect, test, type Page } from "@playwright/test";
import { STUDENT, expectStored, resetStudent, signIn, sql } from "./helpers";

// Journey M5 (J5.7): a shortlisted course with two intakes open asks which one; choosing moves the
// still-shortlisted application to it with the course's checklist rebuilt, keeping the student's own items.
const SLUG = "e2e-two-intakes";
const TITLE = "MSc Two Intakes";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from institutions where name = 'E2E Intake University';
       with i as (insert into institutions (name, country) values ('E2E Intake University', 'GB') returning id),
       p as (insert into programs (institution_id, slug, title, level, published) select id, '${SLUG}', '${TITLE}', 'master', true from i returning id),
       c1 as (insert into program_cycles (program_id, label, intake_year, intake_term, is_current)
              select id, '2027-autumn', 2027, 'autumn', true from p returning id),
       c2 as (insert into program_cycles (program_id, label, intake_year, intake_term, is_current)
              select id, '2028-spring', 2028, 'spring', true from p returning id),
       d as (insert into deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
             select id, 'all'::applicant_category, 'application'::deadline_kind, 'direct'::owning_system, now() + interval '60 days', 'Europe/London', 'date'::date_precision, 'verified'::fact_status, true from c1
             union all
             select id, 'all'::applicant_category, 'application'::deadline_kind, 'direct'::owning_system, now() + interval '200 days', 'Europe/London', 'date'::date_precision, 'verified'::fact_status, true from c2
             returning cycle_id),
       s as (insert into shortlists (user_id, program_id) select '${STUDENT}', id from p),
       a as (insert into applications (user_id, cycle_id, status) select '${STUDENT}', id, 'shortlisted' from c1 returning id)
       insert into checklist_items (application_id, user_id, title, kind, sort, done)
       select a.id, '${STUDENT}'::uuid, v.title, v.kind, v.sort, v.done
       from a, (values ('Autumn transcript', 'requirement', 1, true), ('Ask my tutor', 'custom', 2, false)) v (title, kind, sort, done)`);
});

test.afterEach(() => {
  sql(`delete from applications where user_id = '${STUDENT}'; delete from shortlists where user_id = '${STUDENT}';
       delete from institutions where name = 'E2E Intake University'`);
});

const steps = async (page: Page) => {
  await page.goto("/app/steps");
  return page.getByRole("article").getByRole("heading").allTextContents();
};

test("choosing the second intake moves the shortlisted application, and the step goes", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  expect((await steps(page)).some((s) => s.startsWith(`Confirm the intake for ${TITLE}`))).toBe(true);

  await page.goto("/app/shortlist");
  const choice = page.getByRole("group", { name: `Which intake? : ${TITLE}` });
  await expect(choice.getByRole("radio")).toHaveCount(2);
  await expect(choice.getByRole("radio", { name: /^Autumn 2027/ })).toBeChecked();
  await choice.getByRole("radio", { name: /^Spring 2028/ }).check();
  const form = page.locator("form", { has: choice });
  // One ticked item from the course's checklist would start again, so the student agrees first.
  await form.getByLabel(/checklist for this course starts again for the new intake \(1 ticked item\)/).check();
  await form.getByRole("button", { name: `Choose this intake : ${TITLE}` }).click();
  await expect(page.getByRole("group", { name: `Which intake? : ${TITLE}` })).toContainText("Applying for Spring 2028");

  await expectStored(
    `select c.label from applications a join program_cycles c on c.id = a.cycle_id where a.user_id = '${STUDENT}'`,
    "2028-spring",
  );
  await expectStored(`select string_agg(title, ',' order by title) from checklist_items where user_id = '${STUDENT}' and kind = 'custom'`, "Ask my tutor");
  await expectStored(`select count(*) from checklist_items where user_id = '${STUDENT}' and title = 'Autumn transcript'`, "0");

  await page.goto("/app/tracker");
  await expect(page.getByRole("article").filter({ hasText: TITLE })).toContainText("Intake: Spring 2028");
  expect((await steps(page)).some((s) => s.startsWith("Confirm the intake"))).toBe(false);
});

test("a course already being prepared keeps its intake and isn't asked", async ({ browser }) => {
  sql(`update applications set status = 'preparing' where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/shortlist");
  await expect(page.getByRole("group", { name: `Which intake? : ${TITLE}` })).toHaveCount(0);
  expect((await steps(page)).some((s) => s.startsWith("Confirm the intake"))).toBe(false);
});
