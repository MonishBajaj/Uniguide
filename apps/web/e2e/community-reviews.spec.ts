import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";
const PROGRAM = `(select id from programs where slug = '${SLUG}')`;
const cleanup = () => sql(`delete from community_posts where program_id = ${PROGRAM}`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
});
test.afterEach(cleanup);

test("11.1 only admitted students review a course; reviews are labelled, moderated, and averaged from five", async ({ browser, page }) => {
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto(`/courses/${SLUG}`);
  const section = student.locator("section[aria-labelledby=reviews]");
  await expect(section).toContainText("You can review this course once you record an admission to it in your tracker.");

  sql(`insert into applications (user_id, cycle_id, status, decision) select '${STUDENT}', c.id, 'decided', 'admitted'
       from program_cycles c where c.program_id = ${PROGRAM} and c.is_current`);
  await student.reload();
  await section.locator("input[name=pseudonym]").fill("Asha R");
  for (const [scale, n] of [["teaching", "5"], ["support", "3"], ["value", "4"]] as const) {
    await section.locator(`input[name=${scale}][value="${n}"]`).check();
  }
  await section.locator("textarea[name=body]").fill("Excellent teaching overall. Write to me at asha.rao@example.com if you want to know more about the modules.");
  await section.locator('button:has-text("Send for moderation")').click();
  await expect(section.locator("form").getByRole("alert")).toHaveText("Remove an email address. Posts never include contact details.");
  await expect(section.locator('input[name=support][value="3"]')).toBeChecked();
  await section.locator("textarea[name=body]").fill("Excellent teaching in the machine learning modules, but the careers service was slow to reply to international students.");
  await section.locator('button:has-text("Send for moderation")').click();
  await expect(section.locator("form").getByRole("status")).toContainText("A moderator will read it");
  await expectStored(`select concat(status, ' ', ratings->>'teaching', ratings->>'support', ratings->>'value') from community_posts where author_id = '${STUDENT}' and kind = 'review'`, "pending 534");

  // One live review per course.
  await section.locator("input[name=pseudonym]").fill("Asha R");
  for (const scale of ["teaching", "support", "value"]) await section.locator(`input[name=${scale}][value="2"]`).check();
  await section.locator("textarea[name=body]").fill("Trying to post a second review of the same course, which should not be allowed at all, however long it is.");
  await section.locator('button:has-text("Send for moderation")').click();
  await expect(section.locator("form").getByRole("alert")).toHaveText("You already have a review of this course waiting or published.");

  // Published, it shows with its label; averages wait for five reviews.
  sql(`update community_posts set status = 'published' where author_id = '${STUDENT}' and kind = 'review'`);
  await page.goto(`/courses/${SLUG}`);
  const guest = page.locator("section[aria-labelledby=reviews]");
  await expect(guest.getByRole("article")).toContainText(["Asha R · Admitted here (self-reported)"]);
  await expect(guest).toContainText("Teaching 5/5 · Support 3/5 · Value 4/5");
  await expect(guest).toContainText("Averages appear once 5 students have reviewed this course (1 so far).");
  await expect(guest.locator("form")).toHaveCount(0);

  sql(`insert into community_posts (author_id, kind, program_id, pseudonym, body, ratings)
       select u.id, 'review', ${PROGRAM}, 'Reviewer ' || row_number() over (), 'A balanced review of the course from another student, long enough to pass.', '{"teaching": 4, "support": 4, "value": 3}'
       from auth.users u where u.email in ('admin@uniguide.local', 'verifier@uniguide.local', 'counselor@uniguide.local', 'parent@uniguide.local');
       update community_posts set status = 'published' where program_id = ${PROGRAM} and kind = 'review'`);
  await page.reload();
  await expect(guest.locator("dl")).toContainText("Teaching4.2 / 5");
  await expect(guest.locator("dl")).toContainText("Support3.8 / 5");
  await expect(guest.locator("dl")).toContainText("Reviews5");
});
