import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from enrichment_jobs where user_id = '${STUDENT}'`);
});
test.afterEach(() => sql(`delete from enrichment_jobs where user_id = '${STUDENT}'`));

// The worker is not running in this suite: the test plays its part by updating the job rows.
test("find universities queues a job and the page follows the worker's stages", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/profile");
  await page.click('button:has-text("Find universities for me")');
  await page.waitForURL("**/app/matching");
  await expect(page.getByRole("heading", { name: "Finding universities for you" })).toBeVisible();
  await expect(page.getByText("Optimizing profile")).toBeVisible();

  const job = sql(`select id from enrichment_jobs where user_id = '${STUDENT}'`);
  expect(sql(`select count(*) from enrichment_items where job_id = '${job}'`)).not.toBe("0");

  sql(`update enrichment_jobs set status = 'running', stage = 'fetching_details' where id = '${job}'`);
  sql(`update enrichment_items set status = 'extracted' where id = (select id from enrichment_items where job_id = '${job}' limit 1)`);
  await expect(page.getByText("Facts found, shown as unverified").first()).toBeVisible({ timeout: 10_000 });

  sql(`update enrichment_jobs set status = 'done', stage = 'done' where id = '${job}'`);
  await expect(page.getByRole("link", { name: "See my matches" })).toBeVisible({ timeout: 10_000 });
});

test("a second search while one is running does not start another job", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/profile");
  await page.click('button:has-text("Find universities for me")');
  await page.waitForURL("**/app/matching");
  await page.goto("/app/profile");
  await page.click('button:has-text("Find universities for me")');
  await page.waitForURL("**/app/matching");
  expect(sql(`select count(*) from enrichment_jobs where user_id = '${STUDENT}'`)).toBe("1");
});
