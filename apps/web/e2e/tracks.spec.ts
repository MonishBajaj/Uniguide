import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, STUDENT } from "./helpers";

test.beforeEach(resetStudent);

test("1.4 a second track has its own matches and its own view of the tracker", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/profile");
  const section = page.locator("section#tracks");
  await section.locator("summary", { hasText: "Add a track" }).click();
  await section.locator("input[name=name]").fill("Australia");
  await section.getByLabel("Master's").check();
  await section.getByLabel("Australia", { exact: true }).check();
  await section.locator("input[name=budget_amount]").fill("90000");
  await section.locator("select[name=budget_currency]").selectOption("AUD");
  await section.locator('button:has-text("Add track")').click();
  await expect(section.getByRole("status")).toHaveText("Added Australia.");
  await expectStored(`select concat(name, ' ', target_countries::text, ' ', budget_currency) from tracks where user_id = '${STUDENT}'`, "Australia {AU} AUD");

  // Main uses the profile's targets (GB, US, DE); the track only Australia.
  await page.goto("/app/match");
  const titles = () => page.locator("main h3").allTextContents();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your matches");
  expect(await titles()).toContain("MSc Data Science");
  expect(await titles()).not.toContain("Master of Information Technology");
  await page.getByRole("navigation", { name: "Application tracks" }).getByRole("link", { name: "Australia" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your matches: Australia");
  expect(await titles()).toContain("Master of Information Technology");
  expect(await titles()).not.toContain("MSc Data Science");

  // Two applications; one moves to the track.
  for (const slug of ["exampleton-msc-data-science", "example-coast-master-of-information-technology"]) {
    await page.goto(`/courses/${slug}`);
    await page.click('button:has-text("Track")');
    await page.waitForURL("**/app/tracker/*");
  }
  await page.locator("select#track_id").selectOption({ label: "Australia" });
  await page.click('button:has-text("Move")');
  await expectStored(`select count(*) from applications where user_id = '${STUDENT}' and track_id is not null`, "1");

  await page.goto("/app/tracker?view=table");
  const nav = page.getByRole("navigation", { name: "Application tracks" });
  await nav.getByRole("link", { name: "Australia" }).click();
  await expect(page.getByText("Master of Information Technology").first()).toBeVisible();
  await expect(page.getByText("MSc Data Science")).toHaveCount(0);
  await nav.getByRole("link", { name: "Main" }).click();
  await expect(page.getByText("MSc Data Science").first()).toBeVisible();
  await expect(page.getByText("Master of Information Technology")).toHaveCount(0);

  // Removing the track puts its application back on Main.
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Remove the Australia track" }).click();
  await expectStored(`select count(*) from applications where user_id = '${STUDENT}' and track_id is null`, "2");
});
