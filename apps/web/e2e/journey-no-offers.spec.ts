import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M5 (J5.4), the second half of the milestone's "done when": a student rejected everywhere has a clear way
// back. Planning the next intake keeps the profile and shortlist, and this round's rejections stop holding them in
// stage 5 while staying in the tracker.
const cycle = (slug: string) =>
  `(select c.id from program_cycles c join programs p on p.id = c.program_id where p.slug = '${slug}' and c.is_current limit 1)`;

test.beforeEach(() => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status, decision) values
         ('${STUDENT}', ${cycle("exampleton-msc-data-science")}, 'decided', 'rejected'),
         ('${STUDENT}', ${cycle("tum-msc-informatics")}, 'decided', 'rejected');
       insert into shortlists (user_id, program_id) select '${STUDENT}', id from programs where slug = 'example-state-ms-computer-science'`);
});

test.afterEach(() => resetStudent());

test("a student rejected everywhere plans the next intake and is back to shortlisting, with the decisions kept", async ({ browser }) => {
  // The seed courses are for the 2027 intake, so the next one is the year after (and never a year already started).
  const year = Math.max(2027, new Date().getUTCFullYear()) + 1;
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app");
  await expect(page.getByText("You're in stage 5 of 7")).toBeVisible();
  await page.getByRole("article").filter({ hasText: "Plan for the next intake" }).getByRole("link", { name: /^Start this step/ }).click();
  await expect(page).toHaveURL(/\/app\/next-intake$/);

  await expect(page.getByRole("heading", { level: 1, name: "Not this time" })).toBeVisible();
  await expect(page.getByText("Many students get in on their second round.")).toBeVisible();
  const decisions = page.getByRole("region", { name: "Your decisions this round" });
  await expect(decisions.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Update your plans" })).toHaveAttribute("href", "/app/onboarding?screen=3");
  await expect(page.getByRole("link", { name: "Try what-if" })).toHaveAttribute("href", "/app/match/what-if");

  await page.getByRole("button", { name: `Plan for ${year}` }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("You're in stage 3 of 7")).toBeVisible();
  expect(sql(`select intake_year || ',' || (intake_rolled_at is not null) from profiles where user_id = '${STUDENT}'`)).toBe(`${year},true`);

  await page.goto("/app/tracker");
  await expect(page.getByRole("region", { name: /^Decided/ }).getByRole("article")).toHaveCount(2);
});
