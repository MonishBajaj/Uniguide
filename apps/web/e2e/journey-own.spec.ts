import { expect, test } from "@playwright/test";
import { STUDENT, audit, resetStudent, signIn, sql } from "./helpers";

// Journey M3 (J3.3): a student who is already applying adds a course that isn't in the catalogue.
test.beforeEach(() => {
  resetStudent();
  sql(`update profiles set entry_path = null where user_id = '${STUDENT}'; delete from enrichment_jobs where user_id = '${STUDENT}'`);
});

const nextYear = new Date().getFullYear() + 1;

async function addOwnCourse(page: import("@playwright/test").Page) {
  const form = page.getByRole("region", { name: "Add a course that isn't listed" });
  await form.getByLabel("University or college").fill("Universiteit Voorbeeld");
  await form.getByLabel("Course title").fill("MSc Urban Planning");
  await form.getByLabel("Country").selectOption("NL");
  await form.getByLabel("Deadline you were given (optional)").fill(`${nextYear}-02-01`);
  await form.getByRole("button", { name: "Add and track it" }).click();
}

test("from \"I'm already applying\", the student adds an unlisted course and it shows everywhere with its label", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/onboarding?screen=2");
  await page.getByLabel(/I'm already applying/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.check('input[name=target_fields][value="06"]');
  await page.selectOption("select[name=intake_year]", String(nextYear));
  await page.click('button:has-text("Save and continue")');
  await page.waitForURL(/\/app\/tracker\?welcome=applying/);

  await page.getByRole("link", { name: "Add it yourself" }).click();
  await expect(page).toHaveURL(/#add-own$/);
  await addOwnCourse(page);

  // The application page: the student's words, the label, and no checked facts.
  await expect(page).toHaveURL(/\/app\/tracker\/[0-9a-f-]+#checklist$/);
  await expect(page.getByRole("heading", { level: 1, name: "MSc Urban Planning" })).toBeVisible();
  await expect(page.getByText("Added by you, not checked")).toBeVisible();
  await expect(page.getByText(`Your date: 1 February ${nextYear}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Course facts and sources" })).toHaveCount(0);
  expect(sql(`select status || ',' || own_country from applications where user_id = '${STUDENT}'`)).toBe("preparing,NL");

  await page.goto("/app/tracker");
  const card = page.getByRole("region", { name: /^Preparing/ }).getByRole("article").filter({ hasText: "MSc Urban Planning" });
  await expect(card).toContainText("Added by you, not checked");
  await expect(card).toContainText(`Your date: 1 February ${nextYear}`);

  // The journey counts it: stage 4, with a step for it that quotes no fact and links no source.
  await page.goto("/app");
  await expect(page.getByText("You're in stage 4 of 7: Prepare.")).toBeVisible();
  const step = page.getByRole("article").filter({ hasText: "MSc Urban Planning" }).first();
  await expect(step).toBeVisible();
  await expect(step.getByRole("link", { name: "Official page" })).toHaveCount(0);
  await expect(step.getByText(/^(Verified|Unverified)/)).toHaveCount(0);
});

test("an own application's outcome can't be shared, and the calendar marks its date as the student's", async ({ browser }) => {
  sql(`insert into applications (user_id, status, decision, own_institution, own_title, own_country, own_due_at)
       values ('${STUDENT}', 'decided', 'admitted', 'Universiteit Voorbeeld', 'MSc Urban Planning', 'NL', '${nextYear}-02-01T23:59:00Z')`);
  const appId = sql(`select id from applications where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto(`/app/tracker/${appId}`);
  await expect(page.getByText("Outcomes can only be shared for courses in our catalogue.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share this outcome" })).toHaveCount(0);

  const ics = await (await page.request.get("/app/tracker/calendar.ics")).text();
  expect(ics).toContain("SUMMARY:Deadline (your date): MSc Urban Planning\\, Universiteit Voorbeeld");
  expect(ics).toContain(`DTSTART;VALUE=DATE:${nextYear}0201`);

  // The offers page names it in the student's words, with the label and no published costs.
  await page.goto("/app/offers");
  await expect(page.getByRole("heading", { name: "MSc Urban Planning" })).toBeVisible();
  await expect(page.getByText("Added by you, not checked")).toBeVisible();
});

test("the add form refuses a half-filled course, and has no serious accessibility issues", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/tracker?own=invalid#add-own");
  await expect(page.getByRole("alert").filter({ hasText: "Give the university" })).toHaveText("Give the university, the course title and the country.");
  const found: string[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    found.push(...(await audit(page, "/app/tracker#add-own")));
  }
  expect(found, found.join("\n")).toEqual([]);
  expect(sql(`select count(*) from applications where user_id = '${STUDENT}'`)).toBe("0");
});
