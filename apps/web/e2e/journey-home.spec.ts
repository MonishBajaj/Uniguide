import { expect, test } from "@playwright/test";
import { APPLICANT, STUDENT, expectStored, resetApplicant, resetStudent, signIn, sql } from "./helpers";

// Journey M2 (J2.3): the journey home at /app.
test.beforeEach(() => {
  resetStudent();
  resetApplicant();
});

test("a student with a preparing application lands on the home in stage 4, and every card's link works", async ({ browser }) => {
  const page = await signIn(browser, "applicant@uniguide.local");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hello, Priya" })).toBeVisible();
  await expect(page.getByText("You're in stage 4 of 7: Prepare.")).toBeVisible();
  await expect(page.locator('ol [aria-current="step"]')).toContainText("Prepare");

  const cards = page.getByRole("article");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(3);
  for (const link of await page.getByRole("link", { name: /^Start this step/ }).all()) {
    const href = (await link.getAttribute("href"))!;
    expect((await page.request.get(href)).status(), href).toBe(200);
  }
  // The home saved the journey it showed.
  await expectStored(`select stage from journey_state where user_id = '${APPLICANT}'`, "4");
});

test("an unverified deadline shows its label and a link to its source", async ({ browser }) => {
  const page = await signIn(browser, "applicant@uniguide.local");
  const fee = page.getByRole("article").filter({ hasText: "Record the application fee" });
  await expect(fee.getByText("Unverified, confirm on the official page")).toBeVisible();
  await expect(fee.getByRole("link", { name: "Official page" })).toHaveAttribute("href", /^https?:\/\//);
  const comingUp = page.getByRole("region", { name: "Coming up" });
  await expect(comingUp.getByText("MSc Data Science")).toBeVisible();
  await expect(comingUp.getByText("Unverified, confirm on the official page")).toBeVisible();
});

test("a student waiting for parental consent stays on the home and sees only the consent step", async ({ browser }) => {
  sql(`update profiles set consent_state = 'pending_parental', entry_path = null where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading", { name: "Ask a parent to confirm your account" })).toBeVisible();
  await expect(cards.getByRole("button")).toHaveCount(0);
  // The layout's consent banner isn't repeated on the home; other pages keep it.
  await expect(page.getByText("A parent or guardian needs to confirm your account")).toHaveCount(0);
  await page.goto("/app/tracker");
  await expect(page.getByText("A parent or guardian needs to confirm your account")).toBeVisible();
});

test("a student who can save data, in stage 1 and without an entry answer, goes to onboarding", async ({ browser }) => {
  sql(`update profiles set entry_path = null where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/onboarding/);
});

test("a student whose consent was revoked sees the banner and no steps", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  sql(`update profiles set consent_state = 'revoked' where user_id = '${STUDENT}'`);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("A parent or guardian withdrew consent for this account.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("when the journey can't be read, the home shows an error with a working retry", async ({ browser }) => {
  const page = await signIn(browser, "applicant@uniguide.local");
  await page.context().addCookies([{ name: "ug_e2e_journey_fail", value: "1", url: page.url() }]);
  await page.goto("/app");
  const alert = page.getByRole("alert").filter({ hasText: "We couldn't load your next steps just now." });
  await expect(alert).toBeVisible();
  // The navigation still renders, without a badge.
  const nav = page.getByRole("list", { name: "Your journey" });
  await expect(nav.getByRole("link", { name: /^Applications/ })).toBeVisible();
  await expect(nav.getByText(/due this fortnight/)).toHaveCount(0);

  await page.context().clearCookies({ name: "ug_e2e_journey_fail" });
  await alert.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hello, Priya" })).toBeVisible();
});

test("the seed student lands on the home in stage 1, not on onboarding", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("You're in stage 1 of 7: Set up.")).toBeVisible();
  await expect(page.getByRole("article").first().getByRole("heading", { name: "Tell us what and where you want to study" })).toBeVisible();
});
