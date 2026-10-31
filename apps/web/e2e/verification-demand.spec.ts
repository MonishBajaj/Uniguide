import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M6 (J6.4, G25): when a student's next steps quote a course's unverified facts, reviewers see that course
// first, with how many students need it, and never who.
const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from journey_state where user_id = '${STUDENT}';
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current`);
});

test.afterEach(() => {
  sql(`delete from journey_state where user_id = '${STUDENT}'`);
});

test("a course students' next steps rely on leads the review queue", async ({ browser }) => {
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/app");
  // The saved journey quotes at least one of the course's unchecked facts.
  expect(Number(sql(`select count(*) from journey_fact_demand() f
                       left join deadlines d on f.fact_table = 'deadlines' and d.id = f.fact_id
                       left join requirements q on f.fact_table = 'requirements' and q.id = f.fact_id
                       join program_cycles c on c.id = coalesce(d.cycle_id, q.cycle_id)
                       join programs p on p.id = c.program_id where p.slug = '${SLUG}'`))).toBeGreaterThan(0);

  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/review");
  const wanted = admin.getByRole("region", { name: "Most wanted" });
  const NEED = /\d+ students?'s? next steps need this/;
  await expect(wanted.getByRole("listitem").filter({ hasText: "MSc Data Science" })).toContainText(NEED);
  // Courses students' next steps need come before the ones only shortlisted.
  const needs = (await wanted.getByRole("listitem").allTextContents()).map((t) => NEED.test(t));
  expect(needs).toEqual([...needs].sort((a, b) => Number(b) - Number(a)));
  await expect(wanted).not.toContainText("student@uniguide.local");
});
