import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

const cleanup = () => sql(`delete from community_amas where title like 'E2E %'`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
  sql(`insert into community_amas (title, host_name, starts_at, ends_at, published) values
         ('E2E Past session', 'Ana', now() - interval '10 days', now() - interval '10 days' + interval '1 hour', true),
         ('E2E Draft session', 'Tom', now() + interval '5 days', now() + interval '5 days 1 hour', false)`);
});
test.afterEach(cleanup);

const local = (d: Date) => d.toISOString().slice(0, 16);

test("11.6 an admin schedules an AMA; students send moderated questions; the host's answers stay as an archive", async ({ browser, page }) => {
  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/community");
  const form = admin.getByRole("form", { name: "New AMA" });
  const start = new Date(Date.now() + 2 * 86_400_000);
  await form.locator("input[name=title]").fill("E2E UK student visas");
  await form.locator("input[name=host_name]").fill("Priya Shah");
  await form.locator("input[name=host_role]").fill("International officer");
  await form.locator("input[name=starts_at]").fill(local(start));
  await form.locator("input[name=ends_at]").fill(local(new Date(start.getTime() + 3_600_000)));
  await form.getByLabel("Publish now").check();
  await form.getByRole("button", { name: "Create AMA" }).click();
  await expectStored(`select concat(published, ' ', to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')) from community_amas where title = 'E2E UK student visas'`, `t ${local(start)}`);

  // Guests see published sessions only: upcoming and past, never drafts.
  await page.goto("/community/ama");
  await expect(page.locator("section[aria-labelledby=upcoming]")).toContainText("E2E UK student visas");
  await expect(page.locator("section[aria-labelledby=past]")).toContainText("E2E Past session");
  await expect(page.getByText("E2E Draft session")).toHaveCount(0);
  await page.getByRole("link", { name: "E2E UK student visas" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E UK student visas");
  const ics = await page.request.get(page.url() + "/event.ics");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:AMA: E2E UK student visas with Priya Shah");
  await expect(page.locator("main").getByRole("link", { name: "Sign in" })).toBeVisible();
  const amaUrl = page.url();

  // A student asks; it is moderated; the admin posts the host's answer.
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto(amaUrl);
  const ask = student.getByRole("form", { name: "Ask the host" });
  await ask.locator("input[name=pseudonym]").fill("Asha R");
  await ask.locator("textarea[name=body]").fill("How long does a CAS take to arrive after I accept?");
  await ask.getByRole("button", { name: "Send question" }).click();
  await expect(ask.getByRole("status")).toContainText("A moderator will pass it to the host");
  await expectStored(`select status from community_posts where author_id = '${STUDENT}' and kind = 'ama_question'`, "pending");

  await admin.goto("/admin/community");
  await admin.locator("article", { hasText: "How long does a CAS take" }).getByRole("button", { name: "Publish" }).click();
  await admin.goto(amaUrl);
  const q = admin.getByRole("article", { name: "Post by Asha R" });
  await q.locator("textarea[name=answer]").fill("Usually within a few days of meeting your conditions.");
  await q.getByRole("button", { name: "Post answer" }).click();
  await expect(q.locator("textarea[name=answer]")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("article", { name: "Post by Asha R" })).toContainText("Answer from Priya ShahUsually within a few days of meeting your conditions.");

  // A past session takes no questions.
  await student.goto("/community/ama");
  await student.getByRole("link", { name: "E2E Past session" }).click();
  await expect(student.getByText("this session has ended")).toBeVisible();
  await expect(student.getByRole("form", { name: "Ask the host" })).toHaveCount(0);
});
