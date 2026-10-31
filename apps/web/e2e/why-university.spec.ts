import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";
const cleanup = () => sql(`delete from faculty_profiles where openalex_id like 'https://openalex.org/A88800%'`);

test.beforeEach(() => {
  resetStudent();
  cleanup();
  sql(`delete from documents where user_id = '${STUDENT}' and kind = 'why_this_university';
       update profiles set research_interests = null where user_id = '${STUDENT}';
       insert into faculty_profiles (institution_id, openalex_id, name, topics, fields, recent_works, research_text, cited_by_count)
       select p.institution_id, 'https://openalex.org/A88800' || n, name, jsonb_build_array(jsonb_build_object('name', topic, 'field', 'Computer Science')),
              '{Computer Science}', jsonb_build_array(jsonb_build_object('title', topic || ' in practice', 'year', 2025, 'doi', null, 'openalex_id', 'W8880' || n)),
              topic, 100 - n
       from programs p, (values (1, 'Priya Raman', 'Hospital scheduling'), (2, 'Tomas Ferreira', 'Graph learning')) v(n, name, topic)
       where p.slug = '${SLUG}'`);
});
test.afterEach(cleanup);

test("5.5 the why-this-university draft shows this course's material and which of it the draft names", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto(`/courses/${SLUG}`);
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const appUrl = page.url();

  await page.click('button:has-text("Write your “Why this university”")');
  await page.waitForURL("**/app/writing/*");
  const material = page.locator("section[aria-labelledby=material]");
  await expect(material.getByText("Priya Raman")).toBeVisible();
  await expect(material.getByText("Tomas Ferreira")).toBeVisible();
  await expect(material.getByText("Exampleton", { exact: true })).toBeVisible();
  await expect(material.getByText("12 months, on campus, taught in English", { exact: false })).toBeVisible();

  // A generic draft names nothing; a specific one is counted.
  await page.locator("textarea").fill("Your world-class faculty and excellent reputation inspire me.");
  await page.click('button:has-text("Save draft")');
  // Wait for the draft to save before reloading.
  await expect.poll(() => sql(`select count(*) from document_versions v join documents d on d.id = v.document_id where d.user_id = '${STUDENT}' and d.kind = 'why_this_university'`)).toBe("1");
  await page.reload();
  await expect(material.getByText("does not name anything specific to this course yet", { exact: false })).toBeVisible();

  await page.locator("textarea").fill("Dr Raman's recent work on hospital scheduling connects to the rostering tool I built in 2025, and Exampleton's hospitals would let me test it.");
  await page.click('button:has-text("Save draft")');
  // Wait for the draft to save before reloading.
  await expect.poll(() => sql(`select count(*) from document_versions v join documents d on d.id = v.document_id where d.user_id = '${STUDENT}' and d.kind = 'why_this_university'`)).toBe("2");
  await page.reload();
  await expect(material.getByText("Your latest draft names 2 of 3 specific things about this course.")).toBeVisible();

  // The application page reopens the same draft.
  await page.goto(appUrl);
  await page.click('button:has-text("Continue your “Why this university”")');
  await page.waitForURL("**/app/writing/*");
  expect(sql(`select count(*) from documents where user_id = '${STUDENT}' and kind = 'why_this_university'`)).toBe("1");
});
