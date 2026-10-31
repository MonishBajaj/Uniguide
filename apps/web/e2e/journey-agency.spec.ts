import { expect, test } from "@playwright/test";
import { STUDENT, audit, resetStudent, signIn, sql } from "./helpers";

// Journey M4 (J4.4): a counselor with a share sees the student's stage and next steps, read only; the student's
// updates page lists stage changes and the steps due soon.
const ORG = "00000000-0000-4000-b000-000000000001";
const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from journey_state where user_id = '${STUDENT}'; delete from journey_events where user_id = '${STUDENT}';
       insert into agency_shares (student_id, org_id, display_name) values ('${STUDENT}', '${ORG}', 'Local student');
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current;
       insert into checklist_items (application_id, user_id, title, kind, due_at)
         select id, user_id, 'Transcript', 'requirement', now() + interval '5 days' from applications where user_id = '${STUDENT}'`);
});

test.afterEach(() => {
  sql(`delete from agency_shares where student_id = '${STUDENT}';
       delete from journey_state where user_id = '${STUDENT}'; delete from journey_events where user_id = '${STUDENT}'`);
});

test("a counselor with a share sees the stage and next steps, without buttons", async ({ browser }) => {
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/app");
  const first = (await student.getByRole("article").getByRole("heading").first().textContent())!;

  const page = await signIn(browser, "counselor@uniguide.local");
  await page.goto(`/agency/${STUDENT}`);
  const stage = page.getByRole("region", { name: "Stage" });
  await expect(stage).toContainText("Stage 4 of 7: Prepare");
  await expect(stage.getByRole("listitem").filter({ hasText: first })).toHaveCount(1);
  await expect(stage.getByRole("button")).toHaveCount(0);
  await expect(stage.getByRole("link")).toHaveCount(0);
  const found = await audit(page, null);
  expect(found, found.join("\n")).toEqual([]);

  // Without the share, nothing.
  sql(`update agency_shares set revoked_at = now() where student_id = '${STUDENT}'`);
  await page.goto(`/agency/${STUDENT}`);
  await expect(page.getByRole("region", { name: "Stage" })).toHaveCount(0);
});

test("the updates page lists stage changes and the steps due soon", async ({ browser }) => {
  // The journey started in stage 3 a month ago, and the student has since reached stage 4.
  sql(`insert into journey_events (user_id, kind, stage, created_at) values
         ('${STUDENT}', 'stage_entered', 3, now() - interval '30 days'), ('${STUDENT}', 'stage_entered', 4, now() - interval '2 days');
       insert into journey_state (user_id, stage, engine_version, computed_at) values ('${STUDENT}', 4, 'journey-0.3.0', now() - interval '2 days')`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/notifications");
  const journey = page.getByRole("region", { name: "Your journey" });
  await expect(journey.getByText("You reached stage 4: Prepare")).toBeVisible();
  await expect(journey.getByText("Your journey started in stage 3: Shortlist")).toBeVisible();
  await expect(journey.getByRole("link", { name: /^Work through the checklist/ })).toBeVisible();
  await expect(journey.getByRole("link", { name: "See all your steps" })).toHaveAttribute("href", "/app/steps");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const found = await audit(page, "/app/notifications");
    expect(found, found.join("\n")).toEqual([]);
  }
});
