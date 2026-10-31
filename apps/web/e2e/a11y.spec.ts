import { expect, test, type Page } from "@playwright/test";
import { audit, resetStudent, signIn, sql, STUDENT } from "./helpers";

// 15.2 Automated accessibility audit: no serious or critical WCAG 2.1 AA violations on key pages.

test("15.2 public pages have no serious accessibility violations", async ({ page }) => {
  const found: string[] = [];
  for (const path of ["/", "/courses", "/courses/exampleton-msc-data-science", "/requirements", "/visas", "/guide", "/accessibility", "/learn", "/blog", "/blog/verified-facts-pipeline", "/login", "/signup"]) {
    found.push(...(await audit(page, path)));
  }
  expect(found, found.join("\n")).toEqual([]);
});

test("15.2 student pages have no serious accessibility violations", async ({ browser }) => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status, decision, deposit_due_at, offer_accepted_at)
       select '${STUDENT}', c.id, 'decided', 'admitted', now() + interval '20 days', now() from program_cycles c join programs p on p.id = c.program_id
       where p.slug = 'exampleton-msc-data-science' and c.is_current`);
  const appId = sql(`select id from applications where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  const found: string[] = [];
  for (const path of ["/app/match", "/app/shortlist", "/app/tracker", "/app/tracker?view=table", `/app/tracker/${appId}`, "/app/tracker/costs", "/app/offers", "/app/departure", "/app/writing", "/app/writing/new", "/app/writing/stories", "/app/recommenders", "/app/cv", "/app/profile", "/app/sharing", "/app/notifications"]) {
    found.push(...(await audit(page, path)));
  }
  expect(found, found.join("\n")).toEqual([]);
});

test("15.2 high contrast and large text stay free of serious violations", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "ug_display", value: "text=larger&contrast=high&motion=reduce", url: baseURL! }]);
  const found: string[] = [];
  for (const path of ["/", "/courses/exampleton-msc-data-science", "/guide", "/accessibility"]) found.push(...(await audit(page, path)));
  expect(found, found.join("\n")).toEqual([]);
});

test("15.2 the parent view has no serious accessibility violations", async ({ browser }) => {
  const page = await signIn(browser, "parent@uniguide.local");
  const found = await audit(page, "/parent");
  expect(found, found.join("\n")).toEqual([]);
});

// Journey M6 (J6.1): every journey page in one audit, at both widths, in English and Hindi. One setup gives the seed
// student a course in every state; the feature specs keep their flows, and their own audit tests moved here.
const ORG = "00000000-0000-4000-b000-000000000001";
const cycleOf = (slug: string) =>
  `(select c.id from program_cycles c join programs p on p.id = c.program_id where p.slug = '${slug}' and c.is_current limit 1)`;

/** A course in every journey state. Returns the application ids. */
function everyState(): string[] {
  resetStudent();
  clearEveryState();
  sql(`with i as (insert into institutions (name, country) values ('E2E Audit University', 'GB') returning id),
       two as (insert into programs (institution_id, slug, title, level, published) select id, 'e2e-audit-two-intakes', 'MSc Audit', 'master', true from i returning id),
       phd as (insert into programs (institution_id, slug, title, level, published) select id, 'e2e-audit-phd', 'PhD Audit', 'doctorate', true from i returning id),
       c1 as (insert into program_cycles (program_id, label, intake_year, intake_term, is_current) select id, '2027-autumn', 2027, 'autumn', true from two returning id),
       c2 as (insert into program_cycles (program_id, label, intake_year, intake_term, is_current) select id, '2028-spring', 2028, 'spring', true from two returning id),
       c3 as (insert into program_cycles (program_id, label, intake_year, intake_term, is_current) select id, '2027-autumn', 2027, 'autumn', true from phd returning id),
       d as (insert into deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
             select id, 'all'::applicant_category, 'application'::deadline_kind, 'direct'::owning_system, now() + interval '60 days',
                    'Europe/London', 'date'::date_precision, 'verified'::fact_status, true from c1
             union all
             select id, 'all'::applicant_category, 'application'::deadline_kind, 'direct'::owning_system, now() + interval '200 days',
                    'Europe/London', 'date'::date_precision, 'unverified'::fact_status, true from c2
             returning id),
       s as (insert into shortlists (user_id, program_id) select '${STUDENT}', id from two),
       a1 as (insert into applications (user_id, cycle_id, status) select '${STUDENT}', id, 'shortlisted' from c1)
       insert into applications (user_id, cycle_id, status) select '${STUDENT}', id, 'preparing' from c3;
       update profiles set target_levels = '{master,doctorate}', research_interests = 'Graph learning' where user_id = '${STUDENT}';
       insert into applications (user_id, cycle_id, status) values ('${STUDENT}', ${cycleOf("exampleton-msc-data-science")}, 'preparing');
       insert into applications (user_id, cycle_id, status, expected_decision_on)
         values ('${STUDENT}', ${cycleOf("tu-beispielstadt-msc-informatik")}, 'submitted', current_date - 3);
       insert into applications (user_id, cycle_id, status, decision, deposit_due_at, offer_accepted_at)
         values ('${STUDENT}', ${cycleOf("tum-msc-informatics")}, 'decided', 'admitted', now() + interval '20 days', now());
       insert into applications (user_id, cycle_id, status, decision)
         values ('${STUDENT}', ${cycleOf("example-state-ms-computer-science")}, 'decided', 'admitted');
       insert into applications (user_id, status, own_institution, own_title, own_country, own_due_at)
         values ('${STUDENT}', 'preparing', 'Universiteit Voorbeeld', 'MSc Urban Planning', 'NL', now() + interval '40 days');
       insert into checklist_items (application_id, user_id, title, kind, due_at)
         select id, user_id, 'Transcript', 'requirement', now() + interval '20 days' from applications
         where user_id = '${STUDENT}' and status = 'preparing';
       insert into application_events (application_id, user_id, kind, occurs_at, note, missing)
         select a.id, '${STUDENT}'::uuid, v.kind, v.occurs_at, v.note, v.missing
         from applications a, (values ('interview', now() + interval '5 days', null, false), ('portal_check', null, 'Transcript missing', true))
           v (kind, occurs_at, note, missing)
         where a.user_id = '${STUDENT}' and a.status = 'submitted';
       insert into offer_conditions (application_id, user_id, conditions)
         select id, user_id, 'Final grade of at least 8.0' from applications where user_id = '${STUDENT}' and offer_accepted_at is not null;
       insert into readiness_items (user_id, kind, ready, expires_on) values ('${STUDENT}', 'passport', true, current_date + 400);
       insert into test_scores (user_id, exam, exam_version, total) values ('${STUDENT}', 'toefl_ibt', 'legacy', 80);
       insert into supervisor_contacts (user_id, application_id, name, institution, contacted_on, reply)
         select '${STUDENT}', a.id, 'Prof. Rao', 'E2E Audit University', current_date - 10, 'positive' from applications a
         join program_cycles c on c.id = a.cycle_id join programs p on p.id = c.program_id where a.user_id = '${STUDENT}' and p.slug = 'e2e-audit-phd';
       insert into agency_shares (student_id, org_id, display_name) values ('${STUDENT}', '${ORG}', 'Local student')`);
  return sql(`select id from applications where user_id = '${STUDENT}' order by created_at`).split("\n");
}

function clearEveryState() {
  sql(`delete from agency_shares where student_id = '${STUDENT}'; delete from readiness_items where user_id = '${STUDENT}';
       delete from test_scores where user_id = '${STUDENT}';
       delete from supervisor_contacts where user_id = '${STUDENT}'; delete from journey_state where user_id = '${STUDENT}';
       delete from institutions where name = 'E2E Audit University';
       update profiles set research_interests = null where user_id = '${STUDENT}'`);
}

const hindi = (page: Page) => page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);

for (const [width, height] of [[1280, 900], [390, 844]]) {
  for (const locale of ["en", "hi"] as const) {
    test.describe(`journey pages at ${width}px in ${locale === "en" ? "English" : "Hindi"}`, () => {
      test.afterEach(() => {
        clearEveryState();
        resetStudent();
      });

      test("the student's pages, with a course in every state, have no serious accessibility violations", async ({ browser }) => {
        const apps = everyState();
        const page = await signIn(browser, "student@uniguide.local");
        await page.setViewportSize({ width, height });
        if (locale === "hi") await hindi(page);
        const found: string[] = [];
        for (const path of [
          "/app", "/app/steps", "/app/match", "/app/shortlist", "/app/tracker", "/app/tracker?view=table",
          ...apps.map((id) => `/app/tracker/${id}`),
          "/app/offers", "/app/departure", "/app/profile", "/app/notifications",
        ]) {
          found.push(...(await audit(page, path)));
        }
        expect(found, found.join("\n")).toEqual([]);
      });

      test("the help panel, \"You made it\", next intake, onboarding and empty pages have no serious accessibility violations", async ({ browser }) => {
        everyState();
        const page = await signIn(browser, "student@uniguide.local");
        await page.setViewportSize({ width, height });
        if (locale === "hi") await hindi(page);
        const found: string[] = [];
        // The help panel, open.
        await page.goto("/app");
        const help = locale === "en" ? "Get help" : "मदद";
        await (width < 768
          ? page.locator("[data-bottom-bar]").getByRole("button", { name: help })
          : page.getByRole("navigation", { name: locale === "en" ? "Main" : "मुख्य" }).getByRole("button", { name: help })
        ).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        found.push(...(await audit(page, null)));
        // "You made it".
        sql(`insert into departure_tasks (user_id, application_id, task_key)
               select user_id, id, 'arrived' from applications where user_id = '${STUDENT}' and offer_accepted_at is not null`);
        found.push(...(await audit(page, "/app")));
        // Rejected everywhere: the next intake.
        resetStudent();
        sql(`insert into applications (user_id, cycle_id, status, decision) values
               ('${STUDENT}', ${cycleOf("exampleton-msc-data-science")}, 'decided', 'rejected')`);
        found.push(...(await audit(page, "/app/next-intake")));
        // Empty pages: nothing in the catalogue fits Japan.
        resetStudent();
        sql(`update profiles set target_countries = '{JP}' where user_id = '${STUDENT}'`);
        for (const path of ["/app/match", "/app/shortlist", "/app/tracker"]) found.push(...(await audit(page, path)));
        // Onboarding is for students who haven't answered the entry question.
        sql(`update profiles set entry_path = null where user_id = '${STUDENT}'`);
        for (const path of ["/app/onboarding", "/app/onboarding?screen=2", "/app/onboarding?screen=3"]) {
          found.push(...(await audit(page, path)));
        }
        expect(found, found.join("\n")).toEqual([]);
      });

      test("the parent's and the counselor's views have no serious accessibility violations", async ({ browser }) => {
        everyState();
        // The student's visit saves the journey both of them read.
        const student = await signIn(browser, "student@uniguide.local");
        await student.goto("/app");
        const found: string[] = [];
        for (const email of ["parent@uniguide.local", "counselor@uniguide.local"]) {
          const page = await signIn(browser, email);
          await page.setViewportSize({ width, height });
          if (locale === "hi") await hindi(page);
          if (email.startsWith("parent")) {
            found.push(...(await audit(page, "/parent")));
          } else {
            await page.goto("/agency");
            await page.click('a:has-text("Local student")');
            await expect(page.getByRole("heading", { name: "Local student", level: 1 })).toBeVisible();
            found.push(...(await audit(page, null)));
          }
        }
        expect(found, found.join("\n")).toEqual([]);
      });
    });
  }
}
