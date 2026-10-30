import { expect, test } from "@playwright/test";
import { STUDENT, audit, resetStudent, signIn, sql } from "./helpers";

// Journey M3 (J3.5): while the catalogue is small, empty pages say so and offer the next thing to do.
test.beforeEach(() => {
  resetStudent();
  // No course in the catalogue is in Japan, so nothing fits.
  sql(`update profiles set target_countries = '{JP}' where user_id = '${STUDENT}'`);
});

test("matches, shortlist and tracker each give a next action when empty", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");

  await page.goto("/app/match");
  await expect(page.getByRole("heading", { name: "We're adding courses for your subject" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find universities for me" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try what-if" })).toHaveAttribute("href", "/app/match/what-if");
  await expect(page.getByRole("link", { name: "Browse all courses" })).toHaveAttribute("href", "/courses");

  await page.goto("/app/shortlist");
  await expect(page.getByRole("heading", { name: "Nothing shortlisted yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See my matches" })).toHaveAttribute("href", "/app/match");
  await expect(page.getByRole("link", { name: "Search courses" })).toHaveAttribute("href", "/courses");

  await page.goto("/app/tracker");
  await expect(page.getByRole("heading", { name: "No applications yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find the courses you're applying to" })).toHaveAttribute("href", "/courses");
  await page.getByRole("link", { name: "Add a course that isn't listed" }).click();
  await expect(page.getByRole("region", { name: "Add a course that isn't listed" })).toBeInViewport();
});

test("matches without a profile send the student to the short profile", async ({ browser }) => {
  sql(`update profiles set target_levels = '{}' where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/match");
  await expect(page.getByRole("heading", { name: "Tell us what you want to study first" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a few details" })).toHaveAttribute("href", "/app/onboarding?screen=3");
});

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`empty pages have no serious accessibility violations at ${width}px, in English and Hindi`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    await page.setViewportSize({ width, height });
    const found: string[] = [];
    for (const path of ["/app/match", "/app/shortlist", "/app/tracker"]) found.push(...(await audit(page, path)));
    await page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);
    for (const path of ["/app/match", "/app/shortlist", "/app/tracker"]) found.push(...(await audit(page, path)));
    expect(found, found.join("\n")).toEqual([]);
  });
}
