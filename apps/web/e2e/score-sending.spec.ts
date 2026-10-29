import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from test_scores where user_id = '${STUDENT}';
       insert into test_scores (user_id, exam, total, taken_on) values ('${STUDENT}', 'ielts_academic', 7.5, '2026-09-01')`);
});

test("4.5 the student records which scores went to an application and when they arrived", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/courses/exampleton-msc-data-science");
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const section = page.locator("section[aria-labelledby=scores]");
  await expect(section.getByText(/This course asks for a language test \(IELTS Academic/)).toBeVisible();
  await expect(section.getByText("Sent 0 of 1.", { exact: false })).toBeVisible();

  await page.selectOption("#send-score", { label: "IELTS Academic 7.5" });
  await page.fill("#send-date", "2026-12-01");
  await page.click('button:has-text("Record score sent")');
  await expect(section.getByText("not confirmed as received yet", { exact: false })).toBeVisible();
  await expect(section.getByText("Sent 1 of 1.", { exact: false })).toBeVisible();

  await section.locator("input[name=received_on]").fill("2026-12-08");
  await section.locator('button:has-text("Mark received")').click();
  await expect(section.getByText("received 8 Dec 2026", { exact: false })).toBeVisible();
  await expectStored(`select received_on from score_reports where user_id = '${STUDENT}'`, "2026-12-08");

  await page.goto("/app/tracker");
  await expect(page.getByText("Scores sent: 1 of 1")).toBeVisible();
});
