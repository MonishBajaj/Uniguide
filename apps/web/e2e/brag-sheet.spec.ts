import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from recommenders where user_id = '${STUDENT}';
       delete from cv_entries where user_id = '${STUDENT}';
       delete from cv_headers where user_id = '${STUDENT}';
       insert into cv_headers (user_id, full_name, contact_line) values ('${STUDENT}', 'Asha Rao', 'asha@example.org');
       insert into cv_entries (user_id, section, title, organisation, start_month, bullets)
         values ('${STUDENT}', 'experience', 'Data intern', 'City Hospital', '2025-06-01', '{"Built a rostering dashboard used by 40 staff"}');
       insert into applications (user_id, cycle_id) select '${STUDENT}', c.id from program_cycles c join programs p on p.id = c.program_id
         where p.slug = 'exampleton-msc-data-science' and c.is_current;
       insert into recommenders (user_id, name, relationship) values ('${STUDENT}', 'Dr Mehta', 'Thesis supervisor');
       insert into recommendation_requests (user_id, recommender_id, application_id, status, due_on)
         select '${STUDENT}', r.id, a.id, 'agreed', '2027-01-10' from recommenders r, applications a
         where r.user_id = '${STUDENT}' and a.user_id = '${STUDENT}'`);
});

test("6.3 the student writes notes for a recommender and prints a brag sheet; nobody else can open it", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/recommenders");
  const mehta = page.locator("section[aria-label='Dr Mehta']");
  await mehta.locator("summary", { hasText: "Brag sheet for Dr Mehta" }).click();
  await mehta.locator("textarea[name=brag_notes]").fill("- Led the capstone scheduling model\n\n- Top 5% in operations research");
  await mehta.locator('button:has-text("Save notes")').click();
  await expect.poll(() => sql(`select brag_notes from recommenders where user_id = '${STUDENT}'`)).toContain("Top 5%");

  await mehta.getByRole("link", { name: "Open printable brag sheet" }).click();
  await page.waitForURL("**/brag-sheet");
  const sheet = page.locator("article");
  await expect(sheet.getByRole("heading", { level: 1 })).toHaveText("Asha Rao: notes for my recommendation letters");
  await expect(sheet.getByText("For Dr Mehta")).toBeVisible();
  await expect(sheet.locator("tbody tr")).toHaveText(["MSc Data ScienceUniversity of Exampleton (placeholder)10 Jan 2027"]);
  await expect(sheet.locator("li")).toContainText(["Led the capstone scheduling model", "Top 5% in operations research", "Built a rostering dashboard used by 40 staff"]);
  const url = page.url();

  // Pages stream, so a missing sheet shows the not-found page rather than a 404 status.
  const other = await signIn(browser, "counselor@uniguide.local");
  await other.goto(url);
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("This page is not on the list");
  await expect(other.getByText("Asha Rao")).toHaveCount(0);
});
