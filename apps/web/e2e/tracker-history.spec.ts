import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, STUDENT } from "./helpers";

test.beforeEach(() => resetStudent());

test("4.7 the application keeps a history of status, decision, portal checks and notes", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/courses/exampleton-msc-data-science");
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const history = page.locator("section[aria-labelledby=portal]");
  await expect(history.getByText("Portal last checked never.")).toBeVisible();
  await expect(history.getByText("Added to your tracker")).toBeVisible();

  await page.fill("#portal-note", "Application under review");
  await page.click('button:has-text("I checked the portal today")');
  await expect(history.getByText("Checked the portal: Application under review")).toBeVisible();
  await expect(history.getByText("Portal last checked today.")).toBeVisible();

  await page.fill("#history-note", "Emailed admissions about my transcript");
  await page.click('button:has-text("Add note")');
  await expect(history.getByText("Emailed admissions about my transcript")).toBeVisible();

  await page.selectOption("select[name=decision]", "admitted");
  await page.click('button:has-text("Save decision")');
  await expect(history.getByText("Decision recorded: Admitted")).toBeVisible();
  await expect(history.getByText("Moved from Shortlisted to Decided")).toBeVisible();
  await expectStored(`select count(*) from application_events where user_id = '${STUDENT}'`, "5");

  await page.goto("/app/tracker?view=table");
  await expect(page.locator("tbody tr").first().locator("td").last()).toHaveText("today");
});
