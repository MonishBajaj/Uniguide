import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("community pages do not exist while COMMUNITY_ENABLED is off", async ({ browser, page }) => {
  await page.goto("/community");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page is not on the list");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Community" })).toHaveCount(0);

  const admin = await signIn(browser, "admin@uniguide.local");
  await expect(admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Community" })).toHaveCount(0);
  await admin.goto("/admin/community");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("This page is not on the list");
});
