import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from documents where user_id = '${STUDENT}' and kind = 'supplemental'`);
});

test("5.6 each of the school's own questions gets its own essay, with strategy for its type", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto(`/courses/${SLUG}`);
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const appUrl = page.url();

  const section = page.locator("section#supplemental");
  await section.locator("textarea[name=question]").fill("Describe a setback you faced and what you learned from it.");
  await section.locator("input[name=word_limit]").fill("250");
  await section.locator('button:has-text("Add a supplemental essay")').click();
  await page.waitForURL("**/app/writing/*");

  await expect(page.locator("blockquote")).toHaveText("Describe a setback you faced and what you learned from it.");
  const strategy = page.locator("section[aria-labelledby=strategy]");
  await expect(strategy.getByText("This looks like a question about a challenge or setback.", { exact: false })).toBeVisible();
  await expect(strategy.getByText("Describe something that did not work. What did you change afterwards?")).toBeVisible();
  await page.locator("summary", { hasText: "Outline" }).click();
  await expect(page.getByText("What changed · about 88 words")).toBeVisible();

  await page.locator("textarea").fill("In my second year our robot failed at the regional final.");
  await page.click('button:has-text("Save draft")');
  await expect.poll(() => sql(`select count(*) from document_versions v join documents d on d.id = v.document_id where d.user_id = '${STUDENT}' and d.kind = 'supplemental'`)).toBe("1");

  // A second question on the same application, of a different type: it shows this course's material.
  await page.goto(appUrl);
  await section.locator("textarea[name=question]").fill("Why Exampleton? (150 words)");
  await section.locator('button:has-text("Add a supplemental essay")').click();
  await page.waitForURL("**/app/writing/*");
  await expect(strategy.getByText("This looks like a question about why you chose this school.", { exact: false })).toBeVisible();
  await expect(page.locator("section[aria-labelledby=material]")).toBeVisible();

  await page.goto(appUrl);
  await expect(section.locator("li")).toHaveCount(2);
  await expect(section.getByText("11 of 250 words", { exact: false })).toBeVisible();
  await expect(section.getByText("Not started")).toBeVisible();
  await section.getByRole("link", { name: "Describe a setback you faced and what you learned from it." }).click();
  await page.waitForURL("**/app/writing/*");
  await expect(page.locator("textarea")).toHaveValue("In my second year our robot failed at the regional final.");
});
