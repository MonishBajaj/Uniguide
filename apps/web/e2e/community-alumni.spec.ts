import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";
const PROGRAM = `(select id from programs where slug = '${SLUG}')`;
const cleanup = () => sql(`delete from community_posts where program_id = ${PROGRAM}; delete from community_alumni where program_id = ${PROGRAM};`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
});
test.afterEach(cleanup);

test("11.3 a student asks; an approved alum answers; only alumni can answer, and everything is moderated", async ({ browser, page }) => {
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto(`/courses/${SLUG}`);
  const qa = student.locator("section[aria-labelledby=alumni]");
  await qa.locator("form[aria-label='Ask a question'] input[name=pseudonym]").fill("Asha R");
  await qa.locator("form[aria-label='Ask a question'] textarea[name=body]").fill("How many hours a week did the course take outside lectures?");
  await qa.getByRole("button", { name: "Send for moderation" }).click();
  await expect(qa.getByRole("status")).toContainText("A moderator will read it");

  // Someone who studied there asks to answer.
  const alum = await signIn(browser, "counselor@uniguide.local");
  await alum.goto(`/courses/${SLUG}`);
  const alumQa = alum.locator("section[aria-labelledby=alumni]");
  await alumQa.getByText("Studied here? Offer to answer questions").click();
  await alumQa.locator("input[name=graduation_year]").fill("2024");
  await alumQa.locator("textarea[name=evidence]").fill("Degree certificate on request");
  await alumQa.getByRole("button", { name: "Send request" }).click();
  // The request form gives way to its status.
  await expect(alumQa).toContainText("Your request to answer as an alum is waiting for a moderator.");

  // The moderator publishes the question and approves the alum.
  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/community");
  await admin.locator("article", { hasText: "How many hours a week" }).getByRole("button", { name: "Publish" }).click();
  await admin.locator("section[aria-labelledby=alumni] article", { hasText: "class of 2024" }).getByRole("button", { name: "Approve" }).click();
  await expectStored(`select status from community_alumni where program_id = ${PROGRAM}`, "approved");

  // Only the alum can answer.
  await student.reload();
  await expect(qa.getByText("Answer as an alum")).toHaveCount(0);
  await alum.reload();
  const question = alumQa.getByRole("article", { name: "Post by Asha R" });
  await question.getByText("Answer as an alum").click();
  await question.locator("input[name=pseudonym]").fill("Class of 24");
  await question.locator("textarea[name=body]").fill("About thirty hours a week in term time, more around project deadlines.");
  await question.getByRole("button", { name: "Send answer for moderation" }).click();
  await expect(question.getByRole("status")).toContainText("A moderator will read it");
  await admin.reload();
  await admin.locator("article", { hasText: "About thirty hours" }).getByRole("button", { name: "Publish" }).click();
  await expectStored(`select count(*) from community_posts where program_id = ${PROGRAM} and status = 'published'`, "2");

  // Guests read both, with the alum's label.
  await page.goto(`/courses/${SLUG}`);
  const guest = page.locator("section[aria-labelledby=alumni]");
  await expect(guest.getByRole("article", { name: "Post by Class of 24" })).toContainText("Class of 24 · Alum, class of 2024");
  await expect(guest).toContainText("Sign in to ask a question.");
  expect(sql(`select count(*) from community_posts where author_id = '${STUDENT}'`)).toBe("1");
});
