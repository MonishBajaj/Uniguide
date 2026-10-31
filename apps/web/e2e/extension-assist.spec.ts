// M7 A1.5: the UniGuide Assist extension, loaded in Chromium, against our own practice portal. The student
// connects the extension on our site, signs in to the portal themselves, and fills, copies or leaves each field
// from the side panel. Run with `pnpm e2e:extension` (the web dev server and the local Supabase stack must be up).
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { APPLICANT, expectStored, resetApplicant, sql } from "./helpers";

const ROOT = resolve(__dirname, "../../..");
const DIST = join(ROOT, "apps/extension/dist-e2e");
const PORTAL = "http://127.0.0.1:4318";
const WEB = `http://localhost:${process.env.E2E_PORT ?? 3000}`;
/** Fixed by the development key, so our sign-in page knows which extension to hand the session to. */
const EXTENSION_ID = "jifoddiefcppdaiohhilpiglhbldfnbf";

test.describe.configure({ mode: "serial" });

let portalServer: ChildProcess;
let ctx: BrowserContext;
let profileDir: string;
let portal: Page;
let panel: Page;

async function waitFor(url: string) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} didn't start`);
}

function resetAssist() {
  sql(`delete from assist_runs where user_id = '${APPLICANT}'`);
  resetApplicant();
  sql(`update profiles set residence_country = 'IN', home_qualification = 'bachelor_4yr', grade_value = 8.4, grade_text = null,
         grade_scale = 'gpa_10', consent_state = 'not_required' where user_id = '${APPLICANT}'`);
}

/** Serious or critical axe findings on the page as it is, at desktop and phone widths. */
async function axe(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    out.push(...violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${width}px ${v.id}: ${v.help}`));
  }
  return out;
}

/** The side panel, opened as a page for the portal's tab (test builds only). */
async function openPanel(): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${EXTENSION_ID}/panel.html`);
  const tabId = await page.evaluate(async (origin) => {
    const tabs = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id?: number }[]> } } }).chrome.tabs;
    return (await tabs.query({ url: `${origin}/*` }))[0]?.id;
  }, PORTAL);
  await page.goto(`chrome-extension://${EXTENSION_ID}/panel.html?tab=${tabId}`);
  return page;
}

const events = () => sql(`select coalesce(string_agg(kind || ':' || coalesce(field_role, '-'), ',' order by id), '') from assist_events where user_id = '${APPLICANT}'`);

test.beforeAll(async () => {
  // Lets the context see and route the extension's service worker requests (the suggestion test).
  process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
  resetAssist();
  execFileSync("node", [join(ROOT, "apps/extension/scripts/build.mjs"), DIST], { env: { ...process.env, EXT_TEST: "1", WEB_ORIGIN: WEB } });
  portalServer = spawn("node", [join(ROOT, "apps/practice-portal/server.mjs")], { env: { ...process.env, PORT: "4318", PRACTICE_TEST: "1" }, stdio: "ignore" });
  await waitFor(`${PORTAL}/sign-in`);
  profileDir = mkdtempSync(join(tmpdir(), "uniguide-ext-"));
  ctx = await chromium.launchPersistentContext(profileDir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  expect(new URL(worker.url()).host).toBe(EXTENSION_ID);
});

test.afterAll(async () => {
  await ctx?.close();
  portalServer?.kill();
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  rmSync(DIST, { recursive: true, force: true });
  resetAssist();
});

test("the panel asks to connect, and connecting happens on UniGuide's own page", async () => {
  // The student signs in to the portal themselves; the extension never sees that password.
  portal = await ctx.newPage();
  await portal.goto(`${PORTAL}/sign-in`);
  await portal.fill("#email", "tester@practice.test");
  await portal.fill("#password", "practice-only");
  await portal.click("#sign-in");
  await portal.goto(`${PORTAL}/apply/about-you`);

  panel = await openPanel();
  await expect(panel.getByRole("heading", { name: "Connect your UniGuide account" })).toBeVisible();

  const connect = await ctx.newPage();
  await connect.goto(`${WEB}/extension/connect`);
  await expect(connect.getByRole("heading", { name: "Connect the UniGuide extension" })).toBeVisible();
  expect(await axe(connect)).toEqual([]);
  await connect.getByLabel("Email").fill("applicant@uniguide.local");
  await connect.getByLabel("UniGuide password").fill("password123");
  await connect.getByRole("button", { name: "Connect the extension" }).click();
  await expect(connect.locator("#connected")).toBeVisible();
  await connect.close();

  await panel.reload();
  await expect(panel.getByText("Signed in as applicant@uniguide.local")).toBeVisible();
});

test("fill one field, copy one, leave one, and only roles reach the log", async () => {
  await expect(panel.getByRole("heading", { name: "Which application is this?" })).toBeVisible();
  await panel.getByRole("button", { name: "Use this application" }).click();

  const email = panel.locator("#row-field-email");
  await expect(email).toContainText("applicant@uniguide.local");
  await expect(email).toContainText("Profile › Email");
  await panel.getByRole("button", { name: "Fill: Email address" }).click();
  await expect(email).toContainText("Filled");
  await expect(portal.locator("#field-email")).toHaveValue("applicant@uniguide.local");
  await expect(portal.locator("#field-given_names")).toHaveValue(""); // one field only

  await panel.getByRole("button", { name: "Copy: Country you live in" }).click();
  await expect(panel.locator("#row-field-country_of_residence")).toContainText("Copied");
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe("IN");
  await expect(portal.locator("#field-country_of_residence")).toHaveValue(""); // copied, not filled

  await panel.getByRole("button", { name: "Leave for me: Phone number (optional)" }).click();
  await expect(panel.locator("#row-field-phone")).toContainText("Left for you");

  // Names and date of birth are listed for the student, with no Fill button (R15).
  await expect(panel.locator("#row-field-given_names")).toContainText("We don't fill this one for you.");
  await expect(panel.getByRole("button", { name: "Fill: Given names" })).toHaveCount(0);

  await expectStored(
    `select feature || ':' || portal || ':' || adapter_version from assist_runs where user_id = '${APPLICANT}'`,
    "fill:practice:practice-1",
  );
  await expect.poll(events).toBe("filled:contact.email,copied:contact.residence_country,skipped:contact.phone");
  expect(await axe(panel)).toEqual([]);
});

test("asks before replacing what the student already typed", async () => {
  await portal.fill("#field-email", "mine@example.com");
  await panel.getByRole("button", { name: "Fill: Email address" }).click();
  const prompt = panel.locator("#overwrite");
  await expect(prompt).toContainText('It says "mine@example.com"');
  await panel.getByRole("button", { name: "Keep what's there" }).click();
  await expect(prompt).toHaveCount(0);
  await expect(portal.locator("#field-email")).toHaveValue("mine@example.com");

  await panel.getByRole("button", { name: "Fill: Email address" }).click();
  await panel.getByRole("button", { name: "Replace" }).click();
  await expect(portal.locator("#field-email")).toHaveValue("applicant@uniguide.local");
});

test("a choice the portal doesn't offer is left alone, never converted", async () => {
  sql(`update profiles set home_qualification = 'bachelor_3yr', grade_value = null, grade_text = '2:1', grade_scale = 'uk_class'
       where user_id = '${APPLICANT}'`);
  await portal.goto(`${PORTAL}/apply/schooling`);
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();

  const scale = panel.locator("#row-field-grade_scale");
  await expect(scale).toContainText("This site wants it in a form your profile doesn't have.");
  await expect(panel.getByRole("button", { name: "Fill: How your grade is given" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Fill: Qualification" })).toHaveCount(0);
  await expect(portal.locator("#field-grade_scale")).toHaveValue("");
  // The grade itself goes in exactly as entered.
  await expect(panel.locator("#row-field-grade_value")).toContainText("2:1");
});

test("a field the rules don't know can get a suggested role, filled only once the student confirms it", async () => {
  sql(`update profiles set home_qualification = 'bachelor_4yr', grade_value = 8.4, grade_text = null, grade_scale = 'gpa_10'
       where user_id = '${APPLICANT}'`);
  await portal.goto(`${PORTAL}/apply/about-you`);
  // A field worded the way another portal might word it, which the practice map doesn't have.
  await portal.evaluate(() =>
    document.querySelector("form[data-page]")!.insertAdjacentHTML(
      "beforeend",
      '<label for="reach">Where can we reach you?</label><input id="reach" name="reach" type="email">',
    ),
  );
  const sent: unknown[] = [];
  await ctx.route("**/functions/v1/suggest-field-role", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ role: "contact.email" }) });
  });
  await panel.reload();
  await panel.getByRole("button", { name: "Use this application" }).click();

  const row = panel.locator("#row-reach");
  await expect(row).toContainText("We don't know what this field asks.");
  await panel.getByRole("button", { name: "Suggest what this asks: Where can we reach you?" }).click();
  await expect(row).toContainText("This field may ask for: Email address");

  // Only the label and our role list went out: no value, no page, no profile.
  expect(sent).toHaveLength(1);
  const body = sent[0] as { label: string; roles: string[] };
  expect(Object.keys(body).sort()).toEqual(["label", "roles"]);
  expect(body.label).toBe("Where can we reach you?");
  expect(body.roles).toContain("contact.email");
  expect(JSON.stringify(body)).not.toContain("applicant@uniguide.local");

  // A suggestion alone fills nothing.
  await expect(panel.getByRole("button", { name: "Fill: Where can we reach you?" })).toHaveCount(0);
  await expect(portal.locator("#reach")).toHaveValue("");

  await panel.getByRole("button", { name: "Yes, use this: Where can we reach you?" }).click();
  await expect(row).toContainText("Suggested, confirmed by you");
  await panel.getByRole("button", { name: "Fill: Where can we reach you?" }).click();
  await expect(portal.locator("#reach")).toHaveValue("applicant@uniguide.local");
  await expect(row).toContainText("Filled");
  await ctx.unroute("**/functions/v1/suggest-field-role");
});

test("while consent is pending the panel shows only the reason", async () => {
  sql(`update profiles set consent_state = 'pending_parental' where user_id = '${APPLICANT}'`);
  await panel.reload();
  await expect(panel.locator("#consent-reason")).toContainText("A parent or guardian still needs to give consent.");
  await expect(panel.locator("select#application")).toHaveCount(0);
  await expect(panel.locator(".row")).toHaveCount(0);
  sql(`update profiles set consent_state = 'not_required' where user_id = '${APPLICANT}'`);
});

test("signing out forgets the session", async () => {
  await panel.reload();
  await panel.getByRole("button", { name: "Sign out" }).click();
  await expect(panel.getByRole("heading", { name: "Connect your UniGuide account" })).toBeVisible();
  await panel.reload();
  await expect(panel.getByRole("heading", { name: "Connect your UniGuide account" })).toBeVisible();
});
