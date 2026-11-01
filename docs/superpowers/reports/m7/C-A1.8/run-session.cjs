// REA step C (M7, A1.8): a full assisted-fill session on our own practice portal, observed three ways:
// REA's page session on the portal tab, the browser's own request log (pages and the extension's service
// worker), and the extension's content security policy. Synthetic data only.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const [, , repo, scratch, outDir] = process.argv;
const PORTAL = "http://127.0.0.1:4318";
const WEB = "http://localhost:3000";
const ID = "jifoddiefcppdaiohhilpiglhbldfnbf";
const APPLICANT = "00000000-0000-4000-a000-000000000006";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DIST = path.join(scratch, "ext-c");
const CDP = "http://127.0.0.1:9223";
const env = { ...process.env, PATH: `${scratch}/rea-cli/node_modules/.bin:${process.env.PATH}` };
const sql = (q) => execFileSync("psql", ["-At", DB, "-c", q]).toString().trim();
fs.mkdirSync(outDir, { recursive: true });

function reset() {
  sql(`delete from assist_runs where user_id = '${APPLICANT}'; delete from test_scores where user_id = '${APPLICANT}';
       delete from cv_entries where user_id = '${APPLICANT}'; delete from documents where user_id = '${APPLICANT}';
       delete from applications where user_id = '${APPLICANT}';
       update profiles set consent_state = 'not_required', residence_country = 'IN', home_qualification = 'bachelor_4yr', grade_value = 8.4,
         grade_text = null, grade_scale = 'gpa_10' where user_id = '${APPLICANT}';
       insert into applications (user_id, cycle_id, status) select '${APPLICANT}', c.id, 'preparing' from program_cycles c
         join programs p on p.id = c.program_id where p.slug = 'exampleton-msc-data-science' and c.is_current;`);
}

(async () => {
  reset();
  sql(`insert into test_scores (user_id, exam, total, taken_on) values ('${APPLICANT}', 'ielts_academic', 7.5, '2026-06-12');
       insert into cv_entries (user_id, section, title, organisation) values ('${APPLICANT}', 'projects', 'Robotics club lead', 'City School')`);
  const docId = sql(`insert into documents (user_id, kind, title) values ('${APPLICANT}', 'personal_statement', 'Personal statement') returning id`).split("\n")[0];
  const draft = "Why I want to study data science, in my own words.";
  const vId = sql(`insert into document_versions (document_id, user_id, body, word_count) values ('${docId}', '${APPLICANT}', '${draft}', 10) returning id`).split("\n")[0];
  sql(`update documents set final_version_id = '${vId}' where id = '${docId}'`);

  execFileSync("node", [path.join(repo, "apps/extension/scripts/build.mjs"), DIST], { env: { ...process.env, EXT_TEST: "1", WEB_ORIGIN: WEB } });
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.json"), "utf8"));
  const portalServer = spawn("node", [path.join(repo, "apps/practice-portal/server.mjs")], { env: { ...process.env, PORT: "4318", PRACTICE_TEST: "1" }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${PORTAL}/sign-in`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  await fetch(`${PORTAL}/__reset`, { method: "POST" });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rea-c-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--remote-debugging-port=9223"],
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const requests = [];
  let phase = "connect";
  ctx.on("request", (r) => {
    const sw = r.serviceWorker();
    const frame = sw ? null : r.frame();
    let from = "other";
    try {
      if (sw) from = "extension service worker";
      else {
        const u = new URL(frame.url());
        from = u.protocol === "chrome-extension:" ? "extension panel" : u.origin === "null" ? u.protocol : u.origin;
      }
    } catch {}
    requests.push({ phase, from, method: r.method(), url: r.url(), type: r.resourceType() });
  });
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  if (new URL(worker.url()).host !== ID) throw new Error("unexpected extension id");

  // The student connects the extension on UniGuide's own page.
  const connect = await ctx.newPage();
  await connect.goto(`${WEB}/extension/connect`);
  await connect.getByLabel("Email").fill("applicant@uniguide.local");
  await connect.getByLabel("UniGuide password").fill("password123");
  await connect.getByRole("button", { name: "Connect the extension" }).click();
  await connect.locator("#connected").waitFor();
  await connect.close();

  // The student signs in to the portal themselves.
  phase = "portal sign-in (student)";
  const portal = await ctx.newPage();
  await portal.goto(`${PORTAL}/sign-in`);
  await portal.fill("#email", "tester@practice.test");
  await portal.fill("#password", "practice-only");
  await portal.click("#sign-in");
  await portal.click("#continue-application");
  await portal.waitForURL("**/apply/about-you");

  // REA observes the portal tab for the whole assisted session.
  const cdp = await ctx.newCDPSession(portal);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  const obs = spawn("rea", ["observe-web-session", CDP, targetInfo.targetId, "--observation-ms", "150000", "--format", "json"], { env });
  let obsOut = "";
  obs.stdout.on("data", (d) => (obsOut += d));
  obs.stderr.on("data", (d) => (obsOut += d));
  const obsDone = new Promise((r) => obs.on("close", r));
  // Wait until REA is recording: a marker navigation of the student's own (reloading the page they're on)
  // must show up in its timeline before the session starts.
  await new Promise((r) => setTimeout(r, 8000));
  await portal.reload();
  await new Promise((r) => setTimeout(r, 2000));

  phase = "assisted session";
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${ID}/panel.html`);
  const tabId = await panel.evaluate(async (o) => (await chrome.tabs.query({ url: `${o}/*` }))[0].id, PORTAL);
  await panel.goto(`chrome-extension://${ID}/panel.html?tab=${tabId}`);
  await panel.getByRole("button", { name: "Use this application" }).click();
  await panel.locator(".row").first().waitFor();

  const values = () =>
    portal.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("form[data-page] input, form[data-page] select, form[data-page] textarea")].map((e) => [
          e.type === "radio" ? `${e.name}=${e.value}` : e.id,
          e.type === "radio" || e.type === "checkbox" ? (e.checked ? "checked" : "") : e.value ? "(has a value)" : "",
        ]),
      ),
    );
  const touched = [];
  const page = async (name, extensionSteps, studentSteps, nextPath) => {
    const before = await values();
    await extensionSteps();
    const after = await values();
    touched.push({
      page: name,
      byExtension: Object.keys(after).filter((k) => after[k] !== before[k]),
    });
    await studentSteps();
    if (nextPath) {
      await portal.click(nextPath === "/review" ? "#sign-continue" : "#save-continue");
      await portal.waitForURL(`**${nextPath}`);
      await panel.locator(".row").first().waitFor().catch(() => {});
    }
  };
  const fill = async (label) => {
    await panel.getByRole("button", { name: `Fill: ${label}`, exact: true }).click();
    await panel.getByRole("button", { name: `Fill: ${label}`, exact: true }).locator("xpath=ancestor::li[1]").getByText("Filled").waitFor();
  };
  const click = (name) => panel.getByRole("button", { name, exact: true }).click();

  await page("about-you", async () => { await fill("Email address"); await fill("Country you live in"); await click("Leave for me: Phone number (optional)"); },
    async () => { await portal.fill("#field-given_names", "Test"); await portal.fill("#field-family_name", "Student"); await portal.fill("#field-date_of_birth", "2007-05-01"); },
    "/apply/schooling");
  await page("schooling", async () => { await fill("Qualification"); await fill("How your grade is given"); await fill("Your overall grade"); },
    async () => { await portal.fill("#field-school_name", "City School"); await portal.check("#field-still_studying-no"); }, "/apply/tests");
  await page("tests", async () => {
    await fill("Have you taken an English language test?");
    await click("Check this page again");
    await fill("Which test?"); await fill("Overall score"); await fill("Date you took it");
  }, async () => {}, "/apply/activities");
  await page("activities", async () => { await fill("What you did"); await click("Copy: Organisation"); await click("Leave for me: Tell us about it"); },
    async () => { await portal.fill("#field-activity_1_organisation", "City School"); }, "/apply/statement");
  await page("statement", async () => { await click("Copy final draft: Why do you want to study this course?"); await panel.getByText("Copied").first().waitFor(); },
    async () => { await portal.fill("#field-statement", draft); }, "/apply/security-check");
  await page("security-check", async () => {}, async () => { await portal.fill("#field-check_word", "PRACTICE"); }, "/apply/fee");
  await page("fee", async () => {}, async () => { await portal.check("#field-fee_waiver"); await portal.fill("#field-fee_waiver_reason", "Synthetic test reason"); }, "/apply/declaration");
  await page("declaration", async () => {}, async () => { await portal.check("#field-declare"); await portal.fill("#field-signed_name", "Test Student"); }, "/review");

  phase = "at the review page";
  const atReview = new URL(portal.url()).pathname;
  const inspect = execFileSync("rea", ["inspect-web-page", CDP, targetInfo.targetId, "--observation-ms", "1500", "--format", "json"], { env, maxBuffer: 64 << 20 }).toString();
  await panel.close(); // ends the run
  await new Promise((r) => setTimeout(r, 2000));
  console.log("waiting for REA's observation window to close");
  await obsDone;

  const events = sql(`select coalesce(string_agg(kind || ':' || coalesce(field_role, '-') || ':' || coalesce(page, '-'), E'\\n' order by id), '') from assist_events where user_id = '${APPLICANT}'`).split("\n");
  const run = sql(`select portal || ' ' || feature || ' ' || adapter_version || ' ' || coalesce(outcome, 'open') from assist_runs where user_id = '${APPLICANT}'`);
  const submitted = sql(`select count(*) from applications where user_id = '${APPLICANT}' and status = 'submitted'`);

  const observe = JSON.parse(obsOut.trim().split("\n").pop()).normalized_result;
  const nav = observe.timeline.filter((e) => e.type !== "lifecycle").map((e) => ({ seq: e.sequence, type: e.type, url: e.url?.replace(PORTAL, ""), scope: e.destination_scope, ...(e.detail ? { detail: e.detail } : {}) }));
  const insp = JSON.parse(inspect.trim().split("\n").pop()).normalized_result;

  const supabase = new URL(manifest.content_security_policy.extension_pages.match(/connect-src ([^;]+)/)[1].trim()).origin;
  const session = requests.filter((r) => r.phase === "assisted session" || r.phase === "at the review page");
  const byFrom = {};
  for (const r of session) {
    const o = (() => { try { const u = new URL(r.url); return u.origin === "null" ? `${u.protocol}//${u.host}` : u.origin; } catch { return r.url.slice(0, 40); } })();
    byFrom[r.from] ??= {};
    byFrom[r.from][o] = (byFrom[r.from][o] ?? 0) + 1;
  }
  const sw = session.filter((r) => r.from === "extension service worker");
  const checks = {
    serviceWorkerOnlySupabase: sw.length > 0 && sw.every((r) => new URL(r.url).origin === supabase),
    nothingUnattributed: session.every((r) => r.from !== "other"),
    serviceWorkerRequests: sw.length,
    portalTabOnlyPortal: session.filter((r) => r.from === PORTAL).every((r) => new URL(r.url).origin === PORTAL),
    panelNoNetwork: session.filter((r) => r.from === "extension panel").every((r) => r.url.startsWith(`chrome-extension://${ID}/`)),
    cspConnectSrc: supabase,
    reaNavigationsAllInScope: nav.every((n) => !n.scope || n.scope === "approved"),
    reaFormSubmissions: nav.filter((n) => n.detail === "formsubmissionpost").length,
    reaRecordedFromStart: nav.some((n) => n.url === "/apply/about-you"),
    studentContinueClicks: 8,
    stoppedAt: atReview,
    applicationSubmitted: submitted !== "0",
  };
  const summary = {
    when: new Date().toISOString(),
    extension: { id: ID, build: "test (EXT_TEST=1)", permissions: manifest.permissions, host_permissions: manifest.host_permissions, csp: manifest.content_security_policy.extension_pages },
    checks,
    fieldsTouchedByExtension: touched,
    auditLog: { run, events },
    requestsDuringSession: byFrom,
    serviceWorkerRequests: sw.map((r) => ({ method: r.method, url: r.url.replace(supabase, "<supabase>").replace(/\?.*$/, "?…") })),
    rea: {
      observe: { window: observe.window, completeness: observe.completeness.status, navigation: nav, limitations: observe.limitations },
      inspectAtReview: { url: insp.target.url, networkRequestsInWindow: insp.network.requests.length, storage: insp.storage, linkDestinations: [...new Set(insp.metadata.dom_urls.map((u) => u.destination_scope))] },
    },
  };
  fs.writeFileSync(path.join(outDir, "session.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(checks, null, 2));
  await ctx.close();
  portalServer.kill();
  fs.rmSync(profile, { recursive: true, force: true });
  reset();
  sql(`delete from applications where user_id = '${APPLICANT}'`);
  execFileSync("psql", ["-At", DB, "-c", `insert into applications (user_id, cycle_id, status) select '${APPLICANT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id where p.slug = 'exampleton-msc-data-science' and c.is_current`]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
