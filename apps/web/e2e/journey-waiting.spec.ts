import { expect, test, type Page } from "@playwright/test";
import { STUDENT, expectStored, resetStudent, signIn, sql } from "./helpers";

// Journey M5 (J5.6): while waiting for a decision, interviews, the student's expected decision date and a portal
// note that something is missing each bring a step, and each is labelled as the student's own.
const SLUG = "exampleton-msc-data-science";

let appId = "";
test.beforeEach(() => {
  resetStudent();
  appId = sql(`with a as (insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'submitted' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current returning id) select id from a`);
});

const steps = async (page: Page) => {
  await page.goto("/app/steps");
  return page.getByRole("article").getByRole("heading").allTextContents();
};

test("an interview, an expected decision date and a missing document each bring a step until dealt with", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  let open = await steps(page);
  for (const s of ["Prepare for your interview", "Record the decision", "Send the missing document"]) expect(open).not.toContain(s);

  await page.goto(`/app/tracker/${appId}#interviews`);
  const waiting = page.getByRole("region", { name: "While you wait" });
  await expect(waiting).toBeInViewport();
  const next = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await waiting.getByLabel("Interview date and time").fill(`${next}T09:30`);
  await waiting.getByRole("button", { name: "Add an interview" }).click();
  await expect(waiting.getByRole("listitem")).toContainText("09:30");
  await expect(waiting.getByRole("listitem")).toContainText("Your date");

  const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  await waiting.getByLabel("When do you expect a decision?").fill(past);
  await waiting.getByRole("button", { name: "Save date" }).click();
  await expect(waiting.getByText(/^You expect a decision by/)).toBeVisible();
  await expectStored(`select expected_decision_on from applications where id = '${appId}'`, past);

  const portal = page.getByRole("region", { name: "Portal and history" });
  await portal.getByLabel("What the portal says (optional)").fill("Transcript not received");
  await portal.getByLabel("The portal says something is missing").check();
  await portal.getByRole("button", { name: "I checked the portal today" }).click();
  await expect(portal.getByText("Missing", { exact: true })).toBeVisible();

  open = await steps(page);
  for (const s of ["Prepare for your interview", "Record the decision", "Send the missing document"]) expect(open).toContain(s);
  await page.getByRole("article").filter({ hasText: "Send the missing document" }).getByRole("link", { name: /^Start this step/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/tracker/${appId}#portal$`));

  await portal.getByRole("button", { name: "Mark sorted : Transcript not received" }).click();
  await expect(portal.getByText(/^· Sorted on/)).toBeVisible();
  expect(await steps(page)).not.toContain("Send the missing document");

  // Recording the decision ends both the decision step and the interview step.
  sql(`update applications set status = 'decided', decision = 'admitted' where id = '${appId}'`);
  open = await steps(page);
  for (const s of ["Prepare for your interview", "Record the decision"]) expect(open).not.toContain(s);
});
