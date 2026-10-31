import { expect, test, type Page } from "@playwright/test";
import { STUDENT, expectStored, resetStudent, signIn, sql } from "./helpers";

// Journey M2 (J2.6): onboarding with the entry question.
test.beforeEach(() => {
  resetStudent();
  // Back to a student who hasn't answered the entry question and has no search yet.
  sql(`update profiles set entry_path = null where user_id = '${STUDENT}'; delete from enrichment_jobs where user_id = '${STUDENT}'`);
});

/** Screen 3 of onboarding: tick a subject and set the intake; the rest comes from resetStudent(). */
async function fillShortProfile(page: Page, { budget = true }: { budget?: boolean } = {}) {
  await page.check('input[name=target_fields][value="06"]');
  const year = String(new Date().getFullYear() + 1);
  await page.selectOption("select[name=intake_year]", year);
  if (!budget) {
    await page.fill("input[name=budget_amount]", "");
    await page.selectOption("select[name=budget_currency]", "");
  }
  await page.click('button:has-text("Save and continue")');
  return year;
}

test("a new student signs up and lands on the first onboarding screen", async ({ page }) => {
  const email = `onboard-${Date.now()}@test.dev`;
  // An adult in the US: no parental consent needed (same form as consent.spec.ts).
  await page.goto("/signup");
  await page.selectOption("select[name=birth_month]", "1");
  await page.selectOption("select[name=birth_year]", String(new Date().getFullYear() - 22));
  await page.selectOption("select[name=residence_country]", "US");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password1234");
  await page.check("input[name=terms]");
  await page.click('button:has-text("Create account")');
  await page.waitForURL(/\/app\/onboarding/);
  await expect(page.getByRole("heading", { level: 1, name: "How UniGuide works" })).toBeVisible();
});

test("Back moves between the screens, and exploring with a complete profile ends on the first matches", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/screen=2/);
  // The browser's own back and forward move between screens, since each screen is its own URL.
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "How UniGuide works" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/screen=2/);
  // So does the Back link on the page.
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How UniGuide works" })).toBeVisible();
  await page.getByRole("link", { name: "Continue" }).click();

  await page.getByLabel(/Just exploring/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/screen=3/);
  const year = await fillShortProfile(page);
  await page.waitForURL(/\/app\/match$/);
  await expectStored(`select entry_path || '|' || intake_year from profiles where user_id = '${STUDENT}'`, `exploring|${year}`);
  await expectStored(`select count(*) from enrichment_jobs where user_id = '${STUDENT}'`, "1");

  // Answered: the home no longer sends the student to onboarding.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
});

test("finishing without a budget ends on the home, which asks for it", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/onboarding?screen=2");
  await page.getByLabel(/Just exploring/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await fillShortProfile(page, { budget: false });
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole("article").filter({ hasText: "Set your budget" })).toBeVisible();
});

test("a student with offers ends on the offers page with a prompt to find their courses", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/onboarding?screen=2");
  await page.getByLabel(/I have offers/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await fillShortProfile(page);
  await page.waitForURL(/\/app\/offers\?welcome=offers/);
  await expect(page.getByText("Find the courses that made you an offer")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find your courses" })).toHaveAttribute("href", "/courses");
});

for (const screen of [1, 2]) {
  test(`"Skip for now" on screen ${screen} ends on the home and isn't asked again`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    await page.goto(`/app/onboarding?screen=${screen}`);
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.waitForURL(/\/app$/);
    await expectStored(`select entry_path from profiles where user_id = '${STUDENT}'`, "exploring");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
  });
}

test("a student waiting for parental consent is sent back to the home", async ({ browser }) => {
  sql(`update profiles set consent_state = 'pending_parental' where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/\/app$/);
});
