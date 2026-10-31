import { expect, test } from "@playwright/test";
import { APPLICANT, STUDENT, expectStored, resetApplicant, resetStudent, signIn, sql } from "./helpers";

// Journey M2 (J2.4): all steps, with snooze, dismiss, mark done and undo.
test.beforeEach(() => {
  resetStudent();
  resetApplicant();
});

const fee = (page: import("@playwright/test").Page) => page.getByRole("article").filter({ hasText: "Record the application fee" });

test("a dismissed step leaves the home and the steps page, and Undo brings it back", async ({ browser }) => {
  const page = await signIn(browser, "applicant@uniguide.local");
  await page.goto("/app/steps");
  await expect(fee(page)).toHaveCount(1);
  await fee(page).getByRole("button", { name: /^Dismiss/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Step dismissed." })).toBeVisible();
  await expect(fee(page)).toHaveCount(0);
  await page.goto("/app");
  await expect(fee(page)).toHaveCount(0);

  await page.goto("/app/steps");
  await page.locator("summary").filter({ hasText: /^Snoozed and dismissed/ }).click();
  await page.getByRole("listitem").filter({ hasText: "Record the application fee" }).getByRole("button", { name: /^Bring back/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Step brought back." })).toBeVisible();
  await expect(fee(page)).toHaveCount(1);

  // Undo straight after dismissing works too.
  await fee(page).getByRole("button", { name: /^Dismiss/ }).click();
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(fee(page)).toHaveCount(1);
});

test("a snoozed step comes back after 7 days, and can be brought back sooner", async ({ browser }) => {
  const page = await signIn(browser, "applicant@uniguide.local");
  await page.goto("/app/steps");
  await fee(page).getByRole("button", { name: /^Snooze 7 days/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Snoozed for 7 days." })).toBeVisible();
  await expectStored(
    `select (until::date - current_date) from journey_step_state where user_id = '${APPLICANT}' and state = 'snoozed'`,
    "7",
  );
  await page.locator("summary").filter({ hasText: /^Snoozed and dismissed/ }).click();
  await expect(page.getByText(/Back on/)).toBeVisible();
  await page.getByRole("button", { name: /^Bring back/ }).click();
  await expect(fee(page)).toHaveCount(1);
});

test("a student marks a step done themselves; it is recorded, and Undo reopens it", async ({ browser }) => {
  // Stage 2 with three target countries, so "Compare your countries" can be marked done.
  sql(`update profiles set target_fields = '{06}' where user_id = '${STUDENT}';
       delete from journey_events where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/steps");
  const compare = page.getByRole("article").filter({ hasText: "Compare your countries" });
  await compare.getByRole("button", { name: /^Mark done/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked done." })).toBeVisible();
  await expect(compare).toHaveCount(0);
  await expectStored(`select count(*) from journey_events where user_id = '${STUDENT}' and step_id = 'S2.03'`, "1");

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(compare).toHaveCount(1);
  // Undoing keeps the event: marking it done was still activity (M2 plan, Deviations).
  await expectStored(`select count(*) from journey_events where user_id = '${STUDENT}' and step_id = 'S2.03'`, "1");
});

test("dismissing the only urgent step clears the Applications badge", async ({ browser }) => {
  sql(`insert into checklist_items (application_id, user_id, title, kind, due_at)
         select id, user_id, 'Transcript', 'requirement', now() + interval '5 days' from applications where user_id = '${APPLICANT}'`);
  const page = await signIn(browser, "applicant@uniguide.local");
  const applications = page.getByRole("list", { name: "Your journey" }).getByRole("link", { name: /^Applications/ });
  await expect(applications).toContainText("1 step due this fortnight");
  const urgent = page.getByRole("article").filter({ hasText: "Work through the checklist" });
  await urgent.getByRole("button", { name: /^Dismiss/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Step dismissed." })).toBeVisible();
  await expect(applications).not.toContainText("due this fortnight");
});

test("when the journey can't be read, the steps page shows an error with a retry", async ({ browser }) => {
  const page = await signIn(browser, "applicant@uniguide.local");
  await page.context().addCookies([{ name: "ug_e2e_journey_fail", value: "1", url: page.url() }]);
  await page.goto("/app/steps");
  const alert = page.getByRole("alert").filter({ hasText: "We couldn't load your next steps just now." });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/app/steps");
});
