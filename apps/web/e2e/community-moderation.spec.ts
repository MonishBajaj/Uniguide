import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const cleanup = () => sql(`delete from community_posts where author_id = '${STUDENT}'; delete from community_alumni where user_id = '${STUDENT}';`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
  sql(`insert into community_posts (author_id, kind, pseudonym, title, body) values
         ('${STUDENT}', 'story', 'Asha R', 'Six applications later', 'What I learned applying to six courses in one autumn.'),
         ('${STUDENT}', 'story', 'Asha R', 'Call me', 'Happy to help anyone, call +91 98765 43210 any evening.')`);
});
test.afterEach(cleanup);

test("community base: an admin publishes, rejects with a reason, and acts on reports; the author sees each outcome", async ({ browser }) => {
  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Community" }).click();
  await admin.waitForURL("**/admin/community");

  const good = admin.locator("article", { hasText: "Six applications later" });
  const phone = admin.locator("article", { hasText: "Call me" });
  await expect(phone.getByRole("alert")).toHaveText("May contain a phone number.");
  await expect(good.getByRole("alert")).toHaveCount(0);
  await phone.locator("input[name=note]").fill("Please remove your phone number.");
  await phone.locator('button:has-text("Reject")').click();
  await expect(phone).toHaveCount(0);
  await good.locator('button:has-text("Publish")').click();
  await expect(good).toHaveCount(0);

  // The author sees what happened to each post.
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/community");
  const mine = student.locator("section[aria-labelledby=mine]");
  await expect(mine.locator("li", { hasText: "Six applications later" })).toContainText("Published");
  await expect(mine.locator("li", { hasText: "Call me" })).toContainText(/Not published · .* · Please remove your phone number\./);

  // A report reaches the queue; upholding it removes the post.
  sql(`insert into community_reports (post_id, reporter_id, reason, note)
       select p.id, '00000000-0000-4000-a000-000000000005', 'misleading', 'Dates are wrong' from community_posts p
       where p.author_id = '${STUDENT}' and p.title = 'Six applications later'`);
  await admin.reload();
  const report = admin.locator("section[aria-labelledby=reports] article", { hasText: "Dates are wrong" });
  await expect(report).toContainText("Six applications later");
  await report.locator('button:has-text("Remove the post")').click();
  await expect(report).toHaveCount(0);
  await student.reload();
  await expect(mine.locator("li", { hasText: "Six applications later" })).toContainText("Removed");

  // Authors can delete their own posts.
  await mine.locator("li", { hasText: "Call me" }).getByRole("button", { name: "Delete" }).click();
  await expect(mine.locator("li", { hasText: "Call me" })).toHaveCount(0);
});
