import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from cv_entries where user_id = '${STUDENT}'; delete from cv_headers where user_id = '${STUDENT}'`);
});

test("6.2 the student builds a CV from their own entries, gets questions on weak points, and prints it", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/writing");
  await page.getByRole("link", { name: "CV", exact: true }).click();
  await page.waitForURL("**/app/cv");

  await page.fill("input[name=full_name]", "Asha Rao");
  await page.fill("input[name=contact_line]", "asha@example.com · Pune");
  await page.click('button:has-text("Save")');
  await expect(page.locator("input[name=full_name]")).toHaveValue("Asha Rao");

  const add = page.locator("section[aria-labelledby=add]");
  await add.locator("select[name=section]").selectOption("experience");
  await add.locator("input[name=title]").fill("Data intern");
  await add.locator("input[name=organisation]").fill("Acme Health");
  await add.locator("input[name=start]").fill("2025-06");
  await add.locator("input[name=current]").check();
  await add.locator("textarea[name=bullets]").fill("Responsible for various reports\n- Built a dashboard used by 40 staff");
  await add.locator('button:has-text("Add entry")').click();

  const intern = page.locator("article[aria-label='Data intern']");
  await expect(intern.getByText("Jun 2025 – present")).toBeVisible();
  await expect(intern.getByText("What did you do yourself? Start with the action you took.")).toBeVisible();
  await expect(intern.getByText("• Built a dashboard used by 40 staff")).toBeVisible();
  await expect(page.getByText("1 point with a question below")).toBeVisible();

  // The student rewrites the point themselves; the question goes away.
  await intern.locator("summary:has-text('Edit')").click();
  await intern.locator("textarea[name=bullets]").fill("Automated 12 weekly reports in Python\nBuilt a dashboard used by 40 staff");
  await intern.locator('button:has-text("Save changes")').click();
  await expect(page.getByText("No questions on your points")).toBeVisible();

  await add.locator("select[name=section]").selectOption("education");
  await add.locator("input[name=title]").fill("BTech Computer Science");
  await add.locator("input[name=start]").fill("2021-08");
  await add.locator("input[name=end]").fill("2025-05");
  await add.locator('button:has-text("Add entry")').click();
  await expect(page.locator("article[aria-label='BTech Computer Science']")).toBeVisible();

  await page.click('a:has-text("Print or save as PDF")');
  await page.waitForURL("**/app/cv/print?template=classic");
  const cv = page.locator("article").first();
  await expect(cv.locator("h1")).toHaveText("Asha Rao");
  await expect(cv.locator("h2")).toHaveText(["Education", "Experience"]);
  await expect(cv.getByText("Aug 2021 – May 2025")).toBeVisible();
  await expect(cv.getByText("Start with the action")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("nav[aria-label=Main]")).toBeHidden();
  await expect(page.locator('button:has-text("Print or save as PDF")')).toBeHidden();
});
