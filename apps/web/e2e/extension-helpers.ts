// Shared setup for the extension's end-to-end specs (M7): build the extension, start the practice portal, load
// both in Chromium, connect the extension on our own sign-in page, and open the side panel for the portal tab.
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { APPLICANT, resetApplicant, sql } from "./helpers";

export const ROOT = resolve(__dirname, "../../..");
export const PORTAL = "http://127.0.0.1:4318";
export const WEB = `http://localhost:${process.env.E2E_PORT ?? 3000}`;
/** Fixed by the development key, so our sign-in page knows which extension to hand the session to. */
export const EXTENSION_ID = "jifoddiefcppdaiohhilpiglhbldfnbf";

export interface Rig {
  ctx: BrowserContext;
  close(): Promise<void>;
}

async function waitFor(url: string) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} didn't start`);
}

/** Build the extension (a test build, plus any extra settings), start the practice portal, and load both. */
export async function launch(name: string, env: Record<string, string> = {}): Promise<Rig> {
  const dist = join(ROOT, `apps/extension/dist-e2e-${name}`);
  execFileSync("node", [join(ROOT, "apps/extension/scripts/build.mjs"), dist], { env: { ...process.env, EXT_TEST: "1", WEB_ORIGIN: WEB, ...env } });
  const portal: ChildProcess = spawn("node", [join(ROOT, "apps/practice-portal/server.mjs")], {
    env: { ...process.env, PORT: "4318", PRACTICE_TEST: "1" },
    stdio: "ignore",
  });
  await waitFor(`${PORTAL}/sign-in`);
  const profileDir = mkdtempSync(join(tmpdir(), `uniguide-${name}-`));
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  expect(new URL(worker.url()).host).toBe(EXTENSION_ID);
  return {
    ctx,
    async close() {
      await ctx.close();
      portal.kill();
      rmSync(profileDir, { recursive: true, force: true });
      rmSync(dist, { recursive: true, force: true });
    },
  };
}

/** The student connects the extension on UniGuide's own page. */
export async function connect(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.goto(`${WEB}/extension/connect`);
  await page.getByLabel("Email").fill("applicant@uniguide.local");
  await page.getByLabel("UniGuide password").fill("password123");
  await page.getByRole("button", { name: "Connect the extension" }).click();
  await expect(page.locator("#connected")).toBeVisible();
  await page.close();
}

/** A fresh practice application, signed into by the student themselves. Returns the portal tab on its dashboard. */
export async function freshPortal(ctx: BrowserContext, portal?: Page): Promise<Page> {
  await fetch(`${PORTAL}/__reset`, { method: "POST" });
  const page = portal ?? (await ctx.newPage());
  await page.goto(`${PORTAL}/sign-in`);
  await page.fill("#email", "tester@practice.test");
  await page.fill("#password", "practice-only");
  await page.click("#sign-in");
  await page.waitForURL(`${PORTAL}/`);
  return page;
}

/** The side panel, opened as a page for the portal's tab (test builds only), with the application chosen. */
export async function openPanel(ctx: BrowserContext): Promise<Page> {
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXTENSION_ID}/panel.html`);
  const tabId = await panel.evaluate(async (origin) => {
    const tabs = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id?: number }[]> } } }).chrome.tabs;
    return (await tabs.query({ url: `${origin}/*` }))[0]?.id;
  }, PORTAL);
  await panel.goto(`chrome-extension://${EXTENSION_ID}/panel.html?tab=${tabId}`);
  await panel.getByRole("button", { name: "Use this application" }).click();
  return panel;
}

/** The applicant with a full profile: an English test and a CV entry, one preparing application, no runs. */
export function resetApplicantForAssist() {
  sql(`delete from assist_runs where user_id = '${APPLICANT}';
       delete from test_scores where user_id = '${APPLICANT}';
       delete from cv_entries where user_id = '${APPLICANT}';
       delete from documents where user_id = '${APPLICANT}'`);
  resetApplicant();
  sql(`update profiles set residence_country = 'IN', home_qualification = 'bachelor_4yr', grade_value = 8.4, grade_text = null,
         grade_scale = 'gpa_10', consent_state = 'not_required' where user_id = '${APPLICANT}';
       insert into test_scores (user_id, exam, total, taken_on) values ('${APPLICANT}', 'ielts_academic', 7.5, '2026-06-12');
       insert into cv_entries (user_id, section, title, organisation) values ('${APPLICANT}', 'projects', 'Robotics club lead', 'City School')`);
}

/** The applicant's audit events, as kind:role:reason lines. */
export const eventLines = () =>
  sql(`select coalesce(string_agg(kind || ':' || coalesce(field_role, '-') || ':' || coalesce(reason, '-'), ',' order by id), '')
       from assist_events where user_id = '${APPLICANT}'`)
    .split(",")
    .filter(Boolean);

/** Answer every page of the practice application directly, as the student would, so its review page is reachable. */
export async function completeApplication(portal: Page) {
  await portal.evaluate(async () => {
    const answers: Record<string, Record<string, string>> = {
      "about-you": { given_names: "Test", family_name: "Student", email: "tester@practice.test", date_of_birth: "2007-05-01", country_of_residence: "IN" },
      schooling: { school_name: "City School", qualification: "cbse_12", grade_scale: "percentage", grade_value: "91.4", still_studying: "no" },
      tests: { english_test_taken: "no" },
      activities: { activity_1_role: "Robotics club lead" },
      statement: { statement: "My own words." },
      "security-check": { check_word: "PRACTICE" },
      fee: { fee_waiver: "on", fee_waiver_reason: "Synthetic test reason" },
      declaration: { declare: "on", signed_name: "Test Student" },
    };
    for (const [id, a] of Object.entries(answers)) {
      await fetch(`/apply/${id}`, { method: "POST", body: new URLSearchParams({ action: "continue", ...a }), redirect: "manual" });
    }
  });
}
