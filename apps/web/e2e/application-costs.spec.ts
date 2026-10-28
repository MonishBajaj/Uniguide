import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from application_costs where user_id = '${STUDENT}'; delete from fx_rates where source = 'e2e test'`);
});
test.afterEach(() => sql(`delete from fx_rates where source = 'e2e test'`));

test("4.6 costs are recorded per application and totalled without mixing currencies", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/courses/exampleton-msc-data-science");
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");

  const section = page.locator("section[aria-labelledby=costs]");
  await section.locator("select[name=kind]").selectOption("application_fee");
  await section.locator("input[name=amount]").fill("80");
  await section.locator("select[name=currency]").selectOption("GBP");
  await section.locator("input[name=paid_on]").fill("2026-11-20");
  await section.locator('button:has-text("Add cost")').click();
  await expect(section.getByText("Total for this application: £80")).toBeVisible();

  await page.goto("/app/tracker/costs");
  const add = page.locator("section[aria-labelledby=add]");
  await add.locator("select[name=kind]").selectOption("exam");
  await add.locator("input[name=amount]").fill("250");
  await add.locator("select[name=currency]").selectOption("USD");
  await add.locator('button:has-text("Add cost")').click();

  const totals = page.locator("section[aria-labelledby=totals]");
  await expect(totals.getByText("$250", { exact: true })).toBeVisible();
  await expect(totals.getByText("£80", { exact: true })).toBeVisible();
  // No GBP rate stored: the overall total says what it leaves out.
  await expect(totals.getByText("About $250 in all", { exact: false })).toBeVisible();
  await expect(totals.getByText("not counting GBP (no rate yet)", { exact: false })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody tr", { hasText: "Exam fee" })).toContainText("Not one application");

  sql(`insert into fx_rates (base, quote, rate, as_of, source) values ('GBP', 'USD', 1.25, '2026-11-01', 'e2e test')`);
  await page.reload();
  await expect(totals.getByText("About $350 in all", { exact: false })).toBeVisible();
});
