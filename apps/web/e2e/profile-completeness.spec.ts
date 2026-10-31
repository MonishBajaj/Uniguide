import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  // Qualification and level known; budget, subjects and test scores missing.
  sql(`update profiles set budget_amount = null, budget_currency = null, target_fields = '{}' where user_id = '${STUDENT}';
       delete from test_scores where user_id = '${STUDENT}'`);
});

test("1.2 the profile lists what matching still needs, and fills in as the student adds it", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/profile");
  const card = page.locator("section[aria-labelledby=complete]");
  await expect(card.getByText("3 of 6 done")).toBeVisible();
  await expect(card.getByRole("link", { name: "Your budget and its currency" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Subjects" })).toBeVisible();
  await expect(card.getByRole("link", { name: "At least one test score" })).toBeVisible();

  await card.getByRole("link", { name: "Your budget and its currency" }).click();
  await expect(page).toHaveURL(/#budget$/);
  await page.fill("input[name=budget_amount]", "60000");
  await page.selectOption("select[name=budget_currency]", "USD");
  await page.check('input[name=target_fields][value="06"]');
  await page.click('button:has-text("Save profile")');
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(card.getByText("5 of 6 done")).toBeVisible();
  await expect(card.getByRole("link", { name: "Your budget and its currency" })).toHaveCount(0);

  // A doctorate applicant is also asked for research interests.
  sql(`update profiles set target_levels = '{doctorate}' where user_id = '${STUDENT}'`);
  await page.reload();
  await expect(card.getByText("5 of 7 done")).toBeVisible();
  await expect(card.getByRole("link", { name: "Your research interests" })).toBeVisible();
});

test("the profile saves when the student wants to start (journey step S1.03)", async ({ browser }) => {
  sql(`update profiles set intake_year = null where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/profile#intake");
  const year = String(new Date().getFullYear() + 1);
  await page.selectOption("select[name=intake_year]", year);
  await page.click('button:has-text("Save profile")');
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expectStored(`select intake_year from profiles where user_id = '${STUDENT}'`, year);
});
