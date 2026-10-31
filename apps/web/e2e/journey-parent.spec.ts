import { expect, test } from "@playwright/test";
import { STUDENT, audit, resetStudent, signIn, sql } from "./helpers";

// Journey M4 (J4.2): a linked parent sees the stage path, the parent note and parent-safe steps, never the
// student's own step titles, reasons, writing, grades or scores. The spec's M4 "done when", first half.
const PARENT = "00000000-0000-4000-a000-000000000005";
const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from journey_state where user_id = '${STUDENT}';
       update parent_links set revoked_at = null where parent_id = '${PARENT}' and student_id = '${STUDENT}';
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current;
       insert into checklist_items (application_id, user_id, title, kind)
         select id, user_id, 'Transcript', 'requirement' from applications where user_id = '${STUDENT}'`);
});

test.afterEach(() => {
  sql(`update parent_links set revoked_at = null where parent_id = '${PARENT}' and student_id = '${STUDENT}'`);
});

test("before the student opens UniGuide, the parent is told progress will appear", async ({ browser }) => {
  const page = await signIn(browser, "parent@uniguide.local");
  await page.goto("/parent");
  await expect(page.getByText("Local student's progress appears here once they open UniGuide.")).toBeVisible();
});

test("a linked parent sees the stage, the parent note and parent-safe steps only", async ({ browser }) => {
  // The student opens their home, which saves the journey.
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/app");
  await expect(student.getByText("You're in stage 4 of 7: Prepare.")).toBeVisible();
  const own = (await student.getByRole("article").getByRole("heading").allTextContents()).filter(Boolean);

  const page = await signIn(browser, "parent@uniguide.local");
  await page.goto("/parent");
  await expect(page.getByText("Stage 4 of 7: Prepare")).toBeVisible();
  await expect(page.getByRole("list").filter({ has: page.locator('[aria-current="step"]') })).toContainText("Prepare");
  const help = page.getByRole("region", { name: "How you can help right now" });
  await expect(help).toContainText("Help gather documents like transcripts and certificates. The essays are Local student's to write");
  const work = page.getByRole("region", { name: "What Local student is working on" });
  await expect(work.getByRole("listitem").first()).toContainText("Working through the MSc Data Science");

  // None of the student's own step titles anywhere, and no step about writing, grades or scores.
  const text = (await page.locator("main").textContent()) ?? "";
  for (const title of own) expect(text, title).not.toContain(title);
  const steps = ((await work.textContent()) ?? "").toLowerCase();
  for (const word of ["statement", "essay", "ielts", "score", "grade"]) expect(steps, word).not.toContain(word);
});

test("a revoked link shows nothing of the student", async ({ browser }) => {
  sql(`update parent_links set revoked_at = now() where parent_id = '${PARENT}' and student_id = '${STUDENT}'`);
  const page = await signIn(browser, "parent@uniguide.local");
  const response = await page.goto("/parent");
  expect(response?.status() === 404 || (await page.getByText("Local student").count()) === 0).toBe(true);
});

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`the parent view has no serious accessibility violations at ${width}px`, async ({ browser }) => {
    const student = await signIn(browser, "student@uniguide.local");
    await student.goto("/app");
    const page = await signIn(browser, "parent@uniguide.local");
    await page.setViewportSize({ width, height });
    const found = await audit(page, "/parent");
    expect(found, found.join("\n")).toEqual([]);
  });
}
