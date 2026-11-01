// M7 A1.7: the web app's side of application assist. A student marks a final draft; an admin records and
// verifies a course's AI policy, which the course page shows with its status and source; the application page,
// and a counselor with a share, show the assist log with no values in it.
import { expect, test, type Page } from "@playwright/test";
import { APPLICANT, audit, expectStored, resetApplicant, signIn, sql } from "./helpers";

const COURSE = "exampleton-msc-data-science";
const COUNSELOR_ORG = "00000000-0000-4000-b000-000000000001";

async function auditBothWidths(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    out.push(...(await audit(page, null)).map((v) => `${width}px ${v}`));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return out;
}

const programId = () => sql(`select id from programs where slug = '${COURSE}'`);

test.afterAll(() => {
  sql(`delete from documents where user_id = '${APPLICANT}' and title = 'Assist final draft test';
       delete from program_ai_policies where program_id = (select id from programs where slug = '${COURSE}');
       delete from assist_runs where user_id = '${APPLICANT}';
       delete from agency_shares where student_id = '${APPLICANT}'`);
});

test("a student marks one saved version as the final draft, and can change their mind", async ({ browser }) => {
  sql(`delete from documents where user_id = '${APPLICANT}' and title = 'Assist final draft test'`);
  const docId = sql(`insert into documents (user_id, kind, title) values ('${APPLICANT}', 'personal_statement', 'Assist final draft test') returning id`).split("\n")[0]!;
  sql(`insert into document_versions (document_id, user_id, body, word_count, created_at) values
         ('${docId}', '${APPLICANT}', 'An earlier draft in my own words.', 7, now() - interval '2 days'),
         ('${docId}', '${APPLICANT}', 'The draft I want to send, in my own words.', 10, now() - interval '1 day')`);
  const newest = sql(`select id from document_versions where document_id = '${docId}' order by created_at desc limit 1`);

  const page = await signIn(browser, "applicant@uniguide.local");
  await page.goto(`/app/writing/${docId}`);
  await expect(page.getByText("can offer only your final draft")).toBeVisible();
  await expect(page.getByText("No final draft chosen yet.")).toBeVisible();

  await page.locator("#versions li").first().getByRole("button", { name: /Use as final draft/ }).click();
  await expect(page.locator("#versions li[data-final]")).toContainText("Final draft");
  await expectStored(`select final_version_id from documents where id = '${docId}'`, newest);
  expect(await auditBothWidths(page)).toEqual([]);

  await page.getByRole("button", { name: "Stop using as final draft" }).click();
  await expect(page.locator("#versions li[data-final]")).toHaveCount(0);
  await expectStored(`select coalesce(final_version_id::text, 'none') from documents where id = '${docId}'`, "none");
});

test("a course's AI policy shows with its status and source, and unknown means no automatic paste", async ({ browser }) => {
  sql(`delete from program_ai_policies where program_id = '${programId()}'`);
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/courses/${COURSE}`);
  const policy = visitor.locator("#ai-policy");
  await expect(policy).toContainText("Not known yet");
  await expect(policy).toContainText("treats it as not allowing AI help");

  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/ai-policies");
  await admin.getByLabel("Course slug").fill(COURSE);
  await admin.getByLabel("Policy", { exact: true }).selectOption("allows");
  await admin.getByLabel("Official page").fill("https://exampleton.example/admissions/ai-use");
  await admin.getByLabel("Quote from the page").fill("Applicants may use AI tools to check grammar and spelling in their statements.");
  await admin.getByRole("button", { name: "Add policy" }).click();
  await expect(admin.getByText("Applicants may use AI tools")).toBeVisible();
  expect(await auditBothWidths(admin)).toEqual([]);

  await visitor.reload();
  await expect(policy).toContainText("Allows AI help in application essays");
  await expect(policy).toContainText("Unverified");
  await expect(policy).toContainText("Not checked by a person yet");
  // The fill profile still reads it as unknown until it's verified.
  expect(sql(`select public.program_ai_policy('${programId()}')`)).toBe("unknown");

  await admin.getByRole("button", { name: /^Verify/ }).click();
  await expectStored(`select status from program_ai_policies where program_id = '${programId()}'`, "verified");
  await visitor.reload();
  await expect(policy).toContainText("Verified");
  await expect(policy.getByRole("link", { name: "Official page" })).toHaveAttribute("href", "https://exampleton.example/admissions/ai-use");
  expect(sql(`select public.program_ai_policy('${programId()}')`)).toBe("allows");
  expect(await auditBothWidths(visitor)).toEqual([]);
});

test("the application page lists each assist run's fields and outcomes, never a value", async ({ browser }) => {
  resetApplicant();
  sql(`delete from assist_runs where user_id = '${APPLICANT}'`);
  const appId = sql(`select id from applications where user_id = '${APPLICANT}' limit 1`);
  const runId = sql(`insert into assist_runs (user_id, application_id, portal, feature, adapter_version, started_at, ended_at, outcome)
                     values ('${APPLICANT}', '${appId}', 'practice', 'fill', 'practice-1', now() - interval '1 hour', now() - interval '50 minutes', 'stopped')
                     returning id`).split("\n")[0]!;
  sql(`insert into assist_events (run_id, user_id, kind, field_role, page, source, reason) values
         ('${runId}', '${APPLICANT}', 'filled', 'contact.email', 'about-you', 'contact.email', null),
         ('${runId}', '${APPLICANT}', 'copied', 'education.grade.value', 'schooling', 'education.grade.value', null),
         ('${runId}', '${APPLICANT}', 'skipped', 'contact.phone', 'about-you', null, 'student'),
         ('${runId}', '${APPLICANT}', 'blocked', 'declaration.signature', 'declaration', null, 'guard')`);

  const page = await signIn(browser, "applicant@uniguide.local");
  await page.goto(`/app/tracker/${appId}`);
  const log = page.getByRole("region", { name: "Assist log" });
  await expect(log).toContainText("Practice portal · assisted fill");
  await expect(log).toContainText("ended: stopped");
  await log.locator("summary").first().click();
  const events = log.locator(".assist-event");
  await expect(events).toHaveText([
    /Filled\s*· Email address\s*· your profile/,
    /Copied\s*· Overall grade\s*· your grade, as entered/,
    /Left for you\s*· Phone number\s*· your choice/,
    /Stopped by the safety check\s*· A signature\s*· safety check/,
  ]);
  await expect(log).not.toContainText("applicant@uniguide.local");
  expect(await auditBothWidths(page)).toEqual([]);

  // A counselor the student shares with sees the same log, read only.
  sql(`insert into agency_shares (student_id, org_id, display_name) values ('${APPLICANT}', '${COUNSELOR_ORG}', 'Applicant')
       on conflict do nothing`);
  const counselor = await signIn(browser, "counselor@uniguide.local");
  await counselor.goto(`/agency/${APPLICANT}`);
  const shared = counselor.getByRole("region", { name: "Assist log" });
  await expect(shared).toContainText("Read only. Which fields were filled, copied or left, never the values.");
  await shared.locator("summary").first().click();
  await expect(shared.locator(".assist-event").first()).toContainText("Email address");
  await expect(shared.getByRole("button")).toHaveCount(0);
});
