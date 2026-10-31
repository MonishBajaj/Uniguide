import { expect, test, type Page } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M6 (J6.2): in Hindi, steps, hidden steps, the progress line and the parent's view read in Hindi, while
// course and university names stay as their source gives them.
const SLUG = "exampleton-msc-data-science";
const DEVANAGARI = /[\u0900-\u097F]/;

test.beforeEach(() => {
  resetStudent();
  sql(`with a as (insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current returning id, user_id)
       insert into checklist_items (application_id, user_id, title, kind) select id, user_id, 'Transcript', 'requirement' from a`);
});

const hindi = async (page: Page) => page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);

test("a Hindi reader sees their steps, hidden steps and progress in Hindi, with the course name as it is", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await hindi(page);
  await page.goto("/app/steps");
  const titles = await page.getByRole("article").getByRole("heading").allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  for (const t of titles) expect(t, t).toMatch(DEVANAGARI);
  // The checklist step names the course in its own language.
  expect(titles.some((t) => t.includes("MSc Data Science") && t.includes("चेकलिस्ट"))).toBe(true);

  // Dismissing a step lists it, in Hindi, under "Snoozed and dismissed".
  const card = page.getByRole("article").filter({ has: page.getByRole("button", { name: /^हटाएँ/ }) }).first();
  const dismissed = (await card.getByRole("heading").textContent())!;
  await card.getByRole("button", { name: /^हटाएँ/ }).click();
  const list = page.locator("details").filter({ has: page.locator("summary", { hasText: /^टाले और हटाए गए/ }) });
  await list.locator("summary").click();
  await expect(list.getByRole("listitem").filter({ hasText: dismissed })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText(/में से \d+ आवेदन तैयार/)).toBeVisible();
});

test("a Hindi-reading parent sees the parent-safe steps in Hindi", async ({ browser }) => {
  // The student's visit saves the journey the parent reads.
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/app");
  const parent = await signIn(browser, "parent@uniguide.local");
  await hindi(parent);
  await parent.goto("/parent");
  const working = parent.getByRole("region", { name: /अभी किस पर काम कर रहे हैं/ });
  const items = await working.getByRole("listitem").allTextContents();
  expect(items.length).toBeGreaterThan(0);
  for (const t of items) expect(t, t).toMatch(DEVANAGARI);
  await expect(working).toContainText("MSc Data Science");
});
