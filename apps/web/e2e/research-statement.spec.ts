import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";
const cleanup = () => sql(`delete from faculty_profiles where openalex_id like 'https://openalex.org/A88700%'`);

test.beforeEach(() => {
  resetStudent();
  cleanup();
  sql(`delete from documents where user_id = '${STUDENT}' and kind = 'research_statement';
       insert into faculty_profiles (institution_id, openalex_id, name, topics, fields, recent_works, research_text, cited_by_count)
       select p.institution_id, 'https://openalex.org/A887001', 'Priya Raman', '[{"name": "Hospital scheduling", "field": "Computer Science"}]',
              '{Computer Science}', '[{"title": "Rostering under uncertainty", "year": 2025, "doi": null, "openalex_id": "W887001"}]', 'Hospital scheduling', 90
       from programs p where p.slug = '${SLUG}'`);
});
test.afterEach(cleanup);

test("5.7 a research statement shows the course's researchers and checks for a question and a method", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto(`/courses/${SLUG}`);
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const appUrl = page.url();
  await page.click('button:has-text("Write a research statement")');
  await page.waitForURL("**/app/writing/*");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Research statement: MSc Data Science");
  const material = page.locator("section[aria-labelledby=material]");
  await expect(material.getByText("Priya Raman")).toBeVisible();
  await expect(material.getByRole("heading", { name: "Place" })).toHaveCount(0);
  await page.locator("summary", { hasText: "Outline" }).click();
  await expect(page.getByText("How you would answer it", { exact: true })).toBeVisible();

  const checks = page.locator("section[aria-labelledby=research-checks]");
  await expect(checks).toContainText("Save a draft to check");
  await page.locator("textarea").fill("I love data and your department is excellent.");
  await page.click('button:has-text("Save draft")');
  // Wait for the draft to save before reloading.
  await expect.poll(() => sql(`select count(*) from document_versions v join documents d on d.id = v.document_id where d.user_id = '${STUDENT}' and d.kind = 'research_statement'`)).toBe("1");
  await page.reload();
  await expect(checks).toContainText("No research question found yet.");
  await expect(checks).toContainText("No method named yet.");

  await page.locator("textarea").fill("Can rostering under uncertainty cut nurse overtime? I would build a simulation from two years of shift data, as Dr Raman did.");
  await page.click('button:has-text("Save draft")');
  // Wait for the draft to save before reloading.
  await expect.poll(() => sql(`select count(*) from document_versions v join documents d on d.id = v.document_id where d.user_id = '${STUDENT}' and d.kind = 'research_statement'`)).toBe("2");
  await page.reload();
  await expect(checks).toContainText("States a research question (S1).");
  await expect(checks).toContainText("Names how you would answer it: simulation.");
  await expect(material.getByText("Your latest draft names 1 of 1 specific things about this course.")).toBeVisible();

  await page.goto(appUrl);
  await page.click('button:has-text("Continue your research statement")');
  await page.waitForURL("**/app/writing/*");
  expect(sql(`select count(*) from documents where user_id = '${STUDENT}' and kind = 'research_statement'`)).toBe("1");
});
