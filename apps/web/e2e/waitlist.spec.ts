import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from documents where user_id = '${STUDENT}' and kind = 'continued_interest'`);
});

test("4.8 a waitlisted application gets next steps and one letter of continued interest in the coach", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/courses/exampleton-msc-data-science");
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const appUrl = page.url();
  await expect(page.getByText("You're on the waitlist")).toHaveCount(0);

  await page.selectOption("select[name=decision]", "waitlisted");
  await page.click('button:has-text("Save decision")');
  await expect(page.getByText("You're on the waitlist: what to do now")).toBeVisible();
  await expect(page.getByText("Check whether they want updates.")).toBeVisible();
  await expect(page.getByText("Keep a place elsewhere.")).toBeVisible();

  await page.click('button:has-text("Start a letter of continued interest")');
  await page.waitForURL("**/app/writing/*");
  const docUrl = page.url();
  await expect(page.getByText("Letter of continued interest", { exact: false }).first()).toBeVisible();
  await page.click("summary:has-text(\"Outline\")");
  await expect(page.getByText("What is new since you applied")).toBeVisible();
  await expect(page.getByText("limit 300 words", { exact: false })).toBeVisible();

  // Coming back opens the same letter rather than a new one.
  await page.goto(appUrl);
  await page.click('button:has-text("Continue your letter of continued interest")');
  await page.waitForURL("**/app/writing/*");
  expect(page.url()).toBe(docUrl);
  expect(sql(`select count(*) from documents where user_id = '${STUDENT}' and kind = 'continued_interest'`)).toBe("1");
});
