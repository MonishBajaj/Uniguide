import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

const BODY =
  "I applied to five master's courses in the UK and one in Germany. The biggest surprise was how early the German APS step had to start, " +
  "and that my IELTS sections mattered more than the overall band. Start your statement in the summer and ask referees in September.";

const cleanup = () => sql(`delete from community_posts where author_id = '${STUDENT}'`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
});
test.afterEach(cleanup);

test("11.4 a student shares a story; it appears only after moderation, can be filtered and reported", async ({ browser, page }) => {
  await page.goto("/community/stories/new");
  await page.waitForURL("**/login?next=/community/stories/new");

  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/community");
  await student.getByRole("link", { name: /Application stories/ }).click();
  await student.getByRole("link", { name: "Share your story" }).click();
  await student.waitForURL("**/community/stories/new");
  await student.fill("input[name=pseudonym]", "Asha R");
  await student.fill("input[name=title]", "Five UK courses and one German one");
  await student.fill("textarea[name=body]", `${BODY} WhatsApp me if you want my notes.`);
  await student.selectOption("select[name=country]", "GB");
  await student.selectOption("select[name=level]", "master");
  await student.click('button:has-text("Send for moderation")');
  await expect(student.locator("main form").getByRole("alert")).toHaveText("Remove a social media handle or messaging app. Posts never include contact details.");

  // Nothing typed is lost when a post is refused.
  await expect(student.locator("input[name=title]")).toHaveValue("Five UK courses and one German one");
  await expect(student.locator("select[name=country]")).toHaveValue("GB");
  await student.fill("textarea[name=body]", BODY);
  await student.click('button:has-text("Send for moderation")');
  await expect(student.locator("main form").getByRole("status")).toContainText("A moderator will read it before it appears");
  await expectStored(`select concat(status, ' ', country, ' ', level) from community_posts where author_id = '${STUDENT}'`, "pending GB master");

  // Not public until published.
  await page.goto("/community/stories");
  await expect(page.getByText("No stories here yet.")).toBeVisible();
  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/community");
  await admin.locator("article", { hasText: "Five UK courses and one German one" }).locator('button:has-text("Publish")').click();
  await expectStored(`select status from community_posts where author_id = '${STUDENT}'`, "published");

  await page.reload();
  const story = page.getByRole("article", { name: "Five UK courses and one German one" });
  await expect(story).toContainText("Asha R");
  await expect(story).toContainText("United Kingdom · Master's");
  await expect(story.getByText("Report this post")).toHaveCount(0);
  await page.selectOption("select[name=country]", "DE");
  await page.click('button:has-text("Filter")');
  await expect(page.getByText("No stories here yet.")).toBeVisible();

  // A signed-in reader reports it.
  const reader = await signIn(browser, "counselor@uniguide.local");
  await reader.goto("/community/stories");
  const seen = reader.getByRole("article", { name: "Five UK courses and one German one" });
  await seen.getByText("Report this post").click();
  await seen.locator("select[name=reason]").selectOption("misleading");
  await seen.locator('button:has-text("Send report")').click();
  await expectStored(`select r.reason from community_reports r join community_posts p on p.id = r.post_id where p.author_id = '${STUDENT}'`, "misleading");
});
