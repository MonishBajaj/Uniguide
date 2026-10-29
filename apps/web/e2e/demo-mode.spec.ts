import { expect, test } from "@playwright/test";

// Runs as the "demo" project with AUTH_DISABLED=true (`pnpm e2e:demo`).
test.skip(process.env.AUTH_DISABLED !== "true", "needs AUTH_DISABLED=true");

test("a guest who opens a signed-in page is told which mode opens it, and one click gets there", async ({ page }) => {
  await page.goto("/app/tracker");
  await expect(page).toHaveURL(/\/\?from=%2Fapp%2Ftracker$/);
  await expect(page.getByText("To open your tracker, switch to User mode.")).toBeVisible();
  await page.click('button:has-text("Switch to User")');
  await page.waitForURL("**/app/tracker");
  await expect(page.locator("h1", { hasText: "Tracker" })).toBeVisible();
});

test("the parent view asks for Parent mode, and staff pages explain they need real sign-in", async ({ page }) => {
  await page.goto("/parent");
  await expect(page.getByText("To open the parent view, switch to Parent mode.")).toBeVisible();
  await page.goto("/admin/review");
  await expect(page.getByText("The reviewer pages need real sign-in.")).toBeVisible();
});

test("sign-in pages stay switched off", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});
