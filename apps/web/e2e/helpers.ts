import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";

const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Run SQL as postgres against the local stack, for setup and for checking what was stored. */
export function sql(query: string): string {
  return execFileSync("psql", ["-At", DB_URL, "-c", query]).toString().trim();
}

export const STUDENT = "00000000-0000-4000-a000-000000000002";

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
  await page.waitForURL("**/app/**");
  return page;
}

/** Put the seed student back to a known state. */
export function resetStudent() {
  sql(`delete from applications where user_id = '${STUDENT}';
       delete from shortlists where user_id = '${STUDENT}';
       delete from agency_shares where student_id = '${STUDENT}';
       delete from decision_matrices where user_id = '${STUDENT}';
       delete from tracks where user_id = '${STUDENT}';
       update profiles set residence_country = 'IN', target_levels = '{master}', target_countries = '{GB,US,DE}',
         home_qualification = 'bachelor_4yr', grade_value = 8.4, grade_scale = 'gpa_10', budget_amount = 60000,
         budget_currency = 'USD', prior_credits = null, prior_credit_system = null, class_percentile = null,
         preferences = '{}' where user_id = '${STUDENT}'`);
}

export async function expectStored(query: string, expected: string) {
  await expect.poll(() => sql(query), { timeout: 5000 }).toBe(expected);
}

/** Serious and critical WCAG 2.1 AA violations on a page, one line each (15.2). */
export async function audit(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${path} ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
}
