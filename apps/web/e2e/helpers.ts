import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";

const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Run SQL as postgres against the local stack, for setup and for checking what was stored. */
export function sql(query: string): string {
  return execFileSync("psql", ["-At", DB_URL, "-c", query]).toString().trim();
}

export const STUDENT = "00000000-0000-4000-a000-000000000002";
/** The second seed student, applying (journey M2): full profile, one preparing application after resetApplicant(). */
export const APPLICANT = "00000000-0000-4000-a000-000000000006";

export async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto("/login");
  if (new URL(page.url()).pathname === "/") {
    throw new Error("Sign-in is switched off: the dev server has AUTH_DISABLED=true. Stop it and rerun, or set AUTH_DISABLED=false.");
  }
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.click('button:has-text("Sign in")');
  // Students land on the journey home (/app) or a page under it; linked parents are sent on to /parent.
  await page.waitForURL(/\/(app|parent)(\/|\?|$)/);
  return page;
}

/** Put the seed student back to a known state. */
export function resetStudent() {
  sql(`delete from applications where user_id = '${STUDENT}';
       delete from shortlists where user_id = '${STUDENT}';
       delete from agency_shares where student_id = '${STUDENT}';
       delete from decision_matrices where user_id = '${STUDENT}';
       delete from tracks where user_id = '${STUDENT}';
       delete from enrichment_jobs where user_id = '${STUDENT}';
       delete from journey_step_state where user_id = '${STUDENT}';
       insert into enrichment_jobs (user_id, status, stage) values ('${STUDENT}', 'done', 'done');
       update profiles set residence_country = 'IN', target_levels = '{master}', target_countries = '{GB,US,DE}',
         home_qualification = 'bachelor_4yr', grade_value = 8.4, grade_scale = 'gpa_10', budget_amount = 60000,
         budget_currency = 'USD', prior_credits = null, prior_credit_system = null, class_percentile = null,
         preferences = '{}', consent_state = 'not_required', entry_path = 'exploring',
         target_fields = '{}', intake_year = null where user_id = '${STUDENT}'`);
}

/** The applicant back to a full profile with exactly one preparing application, on a placeholder course. */
export function resetApplicant() {
  sql(`delete from applications where user_id = '${APPLICANT}';
       delete from journey_step_state where user_id = '${APPLICANT}';
       update profiles set consent_state = 'not_required', entry_path = 'applying', home_qualification = 'bachelor_4yr',
         grade_value = 8.4, grade_scale = 'gpa_10', budget_amount = 60000, budget_currency = 'USD',
         target_levels = '{master}', target_countries = '{GB,DE}', target_fields = '{06}', intake_year = 2027
       where user_id = '${APPLICANT}';
       insert into applications (user_id, cycle_id, status)
         select '${APPLICANT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = 'exampleton-msc-data-science' and c.is_current`);
}

export async function expectStored(query: string, expected: string) {
  await expect.poll(() => sql(query), { timeout: 5000 }).toBe(expected);
}

/** Serious and critical WCAG 2.1 AA violations on a page, one line each (15.2). */
/** Serious or critical axe violations on `path`, or on the page as it is now when `path` is null. */
export async function audit(page: Page, path: string | null): Promise<string[]> {
  if (path) await page.goto(path);
  path ??= `${new URL(page.url()).pathname} (as shown)`;
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${path} ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
}
