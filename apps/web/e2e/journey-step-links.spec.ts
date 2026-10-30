import { expect, test, type Page } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M3 (J3.6), the milestone's "done when": every step a student in stages 1 to 4 can see links to a page
// that opens, and to the control it names when the link has an anchor.
const cycle = (slug: string) =>
  `(select c.id from program_cycles c join programs p on p.id = c.program_id where p.slug = '${slug}' and c.is_current limit 1)`;

const SETUPS: Record<string, string> = {
  // Stage 1: nothing set up yet.
  "stage 1": `update profiles set target_levels = '{}', target_countries = '{}', budget_amount = null, budget_currency = null,
                home_qualification = null, grade_value = null, grade_scale = null where user_id = '${STUDENT}'`,
  // Stage 2: ready to match, nothing shortlisted.
  "stage 2": `update profiles set target_fields = '{06}', intake_year = ${new Date().getFullYear() + 1} where user_id = '${STUDENT}'`,
  // Stage 3: shortlisted courses, one with a verified TOEFL minimum above the student's best score.
  "stage 3": `insert into test_scores (user_id, exam, exam_version, total) values ('${STUDENT}', 'toefl_ibt', 'legacy', 80);
              insert into shortlists (user_id, program_id) select '${STUDENT}', id from programs where slug in ('tum-msc-informatics', 'exampleton-msc-data-science');
              insert into applications (user_id, cycle_id, status) values
                ('${STUDENT}', ${cycle("tum-msc-informatics")}, 'shortlisted'), ('${STUDENT}', ${cycle("exampleton-msc-data-science")}, 'shortlisted')`,
  // Stage 4: one course being prepared with a checklist, one own application, one shortlisted.
  "stage 4": `insert into applications (user_id, cycle_id, status) values
                ('${STUDENT}', ${cycle("exampleton-msc-data-science")}, 'preparing'), ('${STUDENT}', ${cycle("tum-msc-informatics")}, 'shortlisted');
              insert into applications (user_id, status, own_institution, own_title, own_country, own_due_at)
                values ('${STUDENT}', 'preparing', 'Universiteit Voorbeeld', 'MSc Urban Planning', 'NL', now() + interval '40 days');
              insert into checklist_items (application_id, user_id, title, kind, due_at)
                select id, user_id, 'Transcript', 'requirement', now() + interval '20 days' from applications where user_id = '${STUDENT}' and status = 'preparing'`,
};

async function stepLinks(page: Page): Promise<{ title: string; href: string }[]> {
  await page.goto("/app/steps");
  const cards = page.getByRole("article").filter({ has: page.getByRole("link", { name: /^Start this step/ }) });
  const links: { title: string; href: string }[] = [];
  for (const card of await cards.all()) {
    const title = (await card.getByRole("heading").first().textContent()) ?? "";
    const href = (await card.getByRole("link", { name: /^Start this step/ }).getAttribute("href")) ?? "";
    links.push({ title, href });
  }
  return links;
}

for (const [stage, setup] of Object.entries(SETUPS)) {
  test(`every ${stage} step lands on a working page and control`, async ({ browser }) => {
    resetStudent();
    sql(`delete from test_scores where user_id = '${STUDENT}'; ${setup}`);
    try {
      const page = await signIn(browser, "student@uniguide.local");
      await page.goto("/app");
      await expect(page.getByText(`You're in ${stage} of 7`)).toBeVisible();
      const links = await stepLinks(page);
      expect(links.length, "open steps").toBeGreaterThan(0);
      for (const { title, href } of links) {
        // goto returns null when only the anchor changes on the same page.
        const response = await page.goto(href);
        if (response) expect(response.status(), `${title} → ${href}`).toBeLessThan(400);
        await expect(page.getByText("This page could not be found"), `${title} → ${href}`).toHaveCount(0);
        const anchor = href.split("#")[1];
        if (anchor) await expect(page.locator(`[id="${anchor}"]`), `${title} → ${href}`).toHaveCount(1);
      }
    } finally {
      sql(`delete from test_scores where user_id = '${STUDENT}'`);
    }
  });
}
