import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test("waitlist signup keeps the campaign and stays private", async ({ page }) => {
  const email = `wait${Date.now()}@example.com`;
  await page.goto("/?utm_source=reddit");
  await page.check("input[value=verified_tracker]");
  await page.selectOption("select[name=target_level]", "master");
  await page.selectOption("select[name=residence_country]", "IN");
  await page.check("input[name=destination_countries][value=GB]");
  await page.fill("input[name=email]", email);
  await page.check("input[name=confirmed_13_plus]");
  await page.click('button:has-text("Join the waitlist")');
  await expect(page.getByText("You are on the list")).toBeVisible();
  expect(sql(`select count(*) from signups where email = '${email}' and utm ->> 'utm_source' = 'reddit'`)).toBe("1");
});

test("explore, course facts with their status, and the public tables", async ({ page }) => {
  await page.goto("/courses?q=data&level=master");
  await expect(page.locator("article").first()).toBeVisible();
  await page.goto("/courses/exampleton-msc-data-science");
  await expect(page.getByText("Unverified, confirm on the official page").first()).toBeVisible();
  await expect(page.getByText("Base case")).toBeVisible();
  await page.click('button:has-text("Add to shortlist")');
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.goto("/requirements");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.goto("/visas");
  await expect(page.locator('a[href="https://www.gov.uk/student-visa"]')).toBeVisible();
  await expect(page.getByText("For applicants from India")).toBeVisible();
});
