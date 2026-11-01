// REA step C (M7, A2.5): one guided-apply run on our own practice portal, started from the tracker's Apply button,
// observed four ways: REA's page session on the portal tab, the browser's own request log (pages and the
// extension's service worker), a recorder of every scripted event on the portal's pages, and the extension's
// content security policy. Synthetic data only. Nothing is submitted.
//
//   node run-session.cjs <repo> <scratch with rea-cli> <output dir>
//
// Needs the local stack (Supabase and the web app on :3000). It starts the practice portal itself.
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
const DIST = path.join(scratch, "ext-c-guided");
const CDP = "http://127.0.0.1:9223";
const env = { ...process.env, PATH: `${scratch}/rea-cli/node_modules/.bin:${process.env.PATH}` };
const sql = (q) => execFileSync("psql", ["-At", DB, "-c", q]).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

function reset() {
  sql(`delete from assist_runs where user_id = '${APPLICANT}'; delete from test_scores where user_id = '${APPLICANT}';
       delete from cv_entries where user_id = '${APPLICANT}'; delete from documents where user_id = '${APPLICANT}';
       delete from applications where user_id = '${APPLICANT}';
       delete from program_ai_policies where program_id = (select id from programs where slug = 'exampleton-msc-data-science');
       update profiles set consent_state = 'not_required', residence_country = 'IN', home_qualification = 'bachelor_4yr', grade_value = 8.4,
         grade_text = null, grade_scale = 'gpa_10' where user_id = '${APPLICANT}';
       insert into applications (user_id, cycle_id, status) select '${APPLICANT}', c.id, 'preparing' from program_cycles c
         join programs p on p.id = c.program_id where p.slug = 'exampleton-msc-data-science' and c.is_current;`);
}

(async () => {
  reset();
  // A final draft, and no AI policy on record: the run may offer the draft to copy, never paste it.
  sql(`insert into test_scores (user_id, exam, total, taken_on) values ('${APPLICANT}', 'ielts_academic', 7.5, '2026-06-12');
       insert into cv_entries (user_id, section, title, organisation) values ('${APPLICANT}', 'projects', 'Robotics club lead', 'City School')`);
  const docId = sql(`insert into documents (user_id, kind, title) values ('${APPLICANT}', 'personal_statement', 'Personal statement') returning id`).split("\n")[0];
  const draft = "Why I want to study data science, in my own words.";
  const vId = sql(`insert into document_versions (document_id, user_id, body, word_count) values ('${docId}', '${APPLICANT}', '${draft}', 10) returning id`).split("\n")[0];
  sql(`update documents set final_version_id = '${vId}' where id = '${docId}'`);
  const appId = sql(`select id from applications where user_id = '${APPLICANT}'`);

  execFileSync("node", [path.join(repo, "apps/extension/scripts/build.mjs"), DIST], { env: { ...process.env, EXT_TEST: "1", WEB_ORIGIN: WEB } });
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.json"), "utf8"));
  const portalServer = spawn("node", [path.join(repo, "apps/practice-portal/server.mjs")], { env: { ...process.env, PORT: "4318", PRACTICE_TEST: "1" }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${PORTAL}/sign-in`)).ok) break; } catch {}
    await sleep(200);
  }
  await fetch(`${PORTAL}/__reset`, { method: "POST" });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rea-c-guided-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--remote-debugging-port=9223"],
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);

  // Every request, labelled with where it came from.
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

  // Every scripted (isTrusted = false) input, change and click on the portal's pages. While the run is paused only
  // the student acts, so what happens outside the student's turns is the extension's doing.
  let actor = "extension";
  const scripted = [];
  await ctx.exposeBinding("__reaRecord", (src, e) => scripted.push({ actor, page: new URL(src.page.url()).pathname, ...e }));
  await ctx.addInitScript((portal) => {
    if (location.origin !== portal) return;
    for (const type of ["input", "change", "click"]) {
      document.addEventListener(
        type,
        (e) => {
          if (e.isTrusted) return;
          const t = e.target;
          window.__reaRecord({ type, target: t?.id || t?.name || t?.tagName || "?", text: (t?.textContent || "").trim().slice(0, 40) });
        },
        true,
      );
    }
  }, PORTAL);

  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  if (new URL(worker.url()).host !== ID) throw new Error("unexpected extension id");

  // The student connects the extension on UniGuide's own page, then signs in to UniGuide.
  const connect = await ctx.newPage();
  await connect.goto(`${WEB}/extension/connect`);
  await connect.getByLabel("Email").fill("applicant@uniguide.local");
  await connect.getByLabel("UniGuide password").fill("password123");
  await connect.getByRole("button", { name: "Connect the extension" }).click();
  await connect.locator("#connected").waitFor();
  await connect.close();
  const login = await ctx.newPage();
  await login.goto(`${WEB}/login`);
  await login.fill("input[name=email]", "applicant@uniguide.local");
  await login.fill("input[name=password]", "password123");
  await login.click('button:has-text("Sign in")');
  await login.waitForURL(/\/app(\/|\?|$)/);
  // Chrome stops passing clicks to the tab that just sent a password form; carry on in a fresh tab.
  const web = await ctx.newPage();
  await login.close();

  // Apply from the tracker: the extension opens the portal in a new tab.
  phase = "apply from the tracker";
  await web.goto(`${WEB}/app/tracker/${appId}`);
  const card = web.locator("#apply-with-assist");
  await card.getByRole("button", { name: "Apply with UniGuide Assist" }).waitFor();
  const opened = ctx.waitForEvent("page");
  await card.getByRole("button", { name: "Apply with UniGuide Assist" }).click();
  const portal = await opened;
  await card.getByText("The portal is open in a new tab.").waitFor();
  const openedAt = portal.url();

  // The student signs in to the portal themselves.
  actor = "student";
  phase = "portal sign-in (student)";
  await portal.waitForURL(`${PORTAL}/sign-in`);
  await portal.fill("#email", "tester@practice.test");
  await portal.fill("#password", "practice-only");
  await portal.click("#sign-in");
  await portal.waitForURL(`${PORTAL}/`);

  // A portal update, as far as the run can tell: the school page's first required question is renamed.
  await fetch(`${PORTAL}/__variant?page=schooling&variant=changed`, { method: "POST" });

  // REA observes the portal tab for the whole run. A marker reload of the student's own must appear in its timeline
  // before the run starts, so the timeline covers every page.
  const cdp = await ctx.newCDPSession(portal);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  const obs = spawn("rea", ["observe-web-session", CDP, targetInfo.targetId, "--observation-ms", "180000", "--format", "json"], { env });
  let obsOut = "";
  obs.stdout.on("data", (d) => (obsOut += d));
  obs.stderr.on("data", (d) => (obsOut += d));
  const obsDone = new Promise((r) => obs.on("close", r));
  await sleep(8000);
  await portal.reload();
  await sleep(2000);
  const startedAt = Date.now();

  // The panel, on the portal tab. It has picked up the Apply: the application is already chosen.
  const tabId = await worker.evaluate(async (o) => (await chrome.tabs.query({ url: `${o}/*` }))[0].id, PORTAL);
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${ID}/panel.html?tab=${tabId}`);
  await panel.locator("#from-tracker").waitFor();
  phase = "guided run";
  actor = "extension";
  await panel.getByRole("button", { name: "Start guided apply" }).click();

  const values = () =>
    portal.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("form[data-page] input, form[data-page] select, form[data-page] textarea")].map((e) => [
          e.type === "radio" ? `${e.name}=${e.value}` : e.id,
          e.type === "radio" || e.type === "checkbox" ? (e.checked ? "checked" : "") : e.value ? "(has a value)" : "",
        ]),
      ),
    );
  const pauses = [];
  /** Wait for the run to pause on this page for this reason; note what the page holds at that moment. */
  async function pausedFor(reason, page) {
    const until = Date.now() + 30_000;
    for (;;) {
      const s = await panel.locator("#guided-run").getAttribute("data-status").catch(() => null);
      const r = await panel.locator("#guided-status").getAttribute("data-reason").catch(() => null);
      if (s === "paused" && r === reason && new URL(portal.url()).pathname === page) break;
      if (Date.now() > until) throw new Error(`expected a pause for ${reason} on ${page}; status ${s}, reason ${r}, at ${portal.url()}`);
      await sleep(200);
    }
    const filled = Object.entries(await values()).filter(([, v]) => v).map(([k]) => k);
    pauses.push({ page, reason, at: Math.round((Date.now() - startedAt) / 1000), fieldsWithAValue: filled });
    actor = "student";
  }
  async function resume() {
    actor = "extension";
    await panel.getByRole("button", { name: "Resume" }).click();
    // No two pauses in a row share a page and a reason, so pausedFor can't mistake this pause for the next one.
    await sleep(300);
  }

  await pausedFor("student", "/apply/about-you");
  await portal.fill("#field-given_names", "Test");
  await portal.fill("#field-family_name", "Student");
  await portal.fill("#field-date_of_birth", "2007-05-01");
  await resume();

  // The changed page: it pauses before filling anything. The page is then put back as mapped (as if the map had
  // been updated), the student reloads it and resumes. A renamed question can't be answered on the practice portal.
  await pausedFor("page_differs", "/apply/schooling");
  await fetch(`${PORTAL}/__variant?page=schooling`, { method: "POST" });
  await portal.reload();
  await resume();
  await pausedFor("student", "/apply/schooling");
  await portal.fill("#field-school_name", "City School");
  await portal.check("#field-still_studying-no");
  await resume();

  // The statement: the AI policy is unknown, so the run offers the student's final draft to copy, and the student
  // pastes it themselves.
  await pausedFor("student", "/apply/statement");
  await panel.getByRole("button", { name: "Copy final draft: Why do you want to study this course?" }).click();
  let copied = "";
  for (let i = 0; i < 50 && copied !== draft; i++) {
    await sleep(100);
    copied = await panel.evaluate(() => navigator.clipboard.readText());
  }
  if (copied !== draft) throw new Error("the final draft wasn't copied");
  await portal.fill("#field-statement", copied);
  await resume();

  await pausedFor("captcha", "/apply/security-check");
  await portal.fill("#field-check_word", "PRACTICE");
  await portal.click("#save-continue");
  await portal.waitForURL(`${PORTAL}/apply/fee`);
  await resume();

  await pausedFor("payment", "/apply/fee");
  await portal.check("#field-fee_waiver");
  await portal.fill("#field-fee_waiver_reason", "Synthetic test reason");
  await portal.click("#save-continue");
  await portal.waitForURL(`${PORTAL}/apply/declaration`);
  await resume();

  await pausedFor("declaration", "/apply/declaration");
  await portal.check("#field-declare");
  await portal.fill("#field-signed_name", "Test Student");
  await portal.click("#sign-continue");
  await portal.waitForURL(`${PORTAL}/review`);
  await resume();

  // The review page: the run stops there. Wait, then check nothing moved on.
  await panel.locator('#guided-run[data-status="at_review"]').waitFor({ timeout: 20_000 });
  phase = "at the review page";
  await sleep(4000);
  const atReview = new URL(portal.url()).pathname;
  const summary = {
    filled: await panel.locator("#summary-filled li").allInnerTexts(),
    left: await panel.locator("#summary-left li").allInnerTexts(),
    skipped: await panel.locator("#summary-skipped li").allInnerTexts(),
    paused: await panel.locator("#summary-paused li").allInnerTexts(),
  };
  const inspect = execFileSync("rea", ["inspect-web-page", CDP, targetInfo.targetId, "--observation-ms", "1500", "--format", "json"], { env, maxBuffer: 64 << 20 }).toString();
  await panel.close(); // the run ends at review
  await sleep(2000);
  console.log("waiting for REA's observation window to close");
  await obsDone;

  const events = sql(`select coalesce(string_agg(kind || ':' || coalesce(field_role, '-') || ':' || coalesce(page, '-') || ':' || coalesce(reason, '-'), E'\\n' order by id), '') from assist_events where user_id = '${APPLICANT}'`).split("\n");
  const run = sql(`select portal || ' ' || feature || ' ' || adapter_version || ' ' || coalesce(outcome, 'open') from assist_runs where user_id = '${APPLICANT}'`);
  const submitted = sql(`select count(*) from applications where user_id = '${APPLICANT}' and status = 'submitted'`);
  const eventColumns = sql(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name = 'assist_events'`);

  const observe = JSON.parse(obsOut.trim().split("\n").pop()).normalized_result;
  const nav = observe.timeline
    .filter((e) => e.type !== "lifecycle")
    .map((e) => ({ seq: e.sequence, type: e.type, url: e.url?.replace(PORTAL, ""), scope: e.destination_scope, ...(e.detail ? { detail: e.detail } : {}) }));
  const insp = JSON.parse(inspect.trim().split("\n").pop()).normalized_result;

  const supabase = new URL(manifest.content_security_policy.extension_pages.match(/connect-src ([^;]+)/)[1].trim()).origin;
  const session = requests.filter((r) => r.phase === "guided run" || r.phase === "at the review page");
  const byFrom = {};
  for (const r of session) {
    const o = (() => { try { const u = new URL(r.url); return u.origin === "null" ? `${u.protocol}//${u.host}` : u.origin; } catch { return r.url.slice(0, 40); } })();
    byFrom[r.from] ??= {};
    byFrom[r.from][o] = (byFrom[r.from][o] ?? 0) + 1;
  }
  const sw = session.filter((r) => r.from === "extension service worker");
  const byExtension = scripted.filter((e) => e.actor === "extension");
  const extensionClicks = byExtension.filter((e) => e.type === "click").map((e) => `${e.page} ${e.target}`);
  const fieldsByExtension = {};
  for (const e of byExtension.filter((e) => e.type === "input" || e.type === "change")) {
    fieldsByExtension[e.page] ??= [];
    if (!fieldsByExtension[e.page].includes(e.target)) fieldsByExtension[e.page].push(e.target);
  }
  const FORBIDDEN = ["submit-application", "pay-fee", "sign-continue", "withdraw-application", "sign-out", "add-activity"];
  const checks = {
    openedFromTracker: openedAt.startsWith(PORTAL),
    stoppedAt: atReview,
    applicationSubmitted: submitted !== "0",
    pausesInOrder: pauses.map((p) => `${p.reason}@${p.page}`),
    changedPageNothingFilled: pauses.find((p) => p.reason === "page_differs").fieldsWithAValue.length === 0,
    extensionClicks,
    extensionNeverPressedSubmitPaySignOrCertify: byExtension.every((e) => e.type !== "click" || !FORBIDDEN.includes(e.target)),
    extensionClicksOnlyContinue: extensionClicks.every((c) => / (save-continue|continue-application)$/.test(c)),
    extensionTouchedNothingOnPausePages: byExtension.every((e) => !["/apply/security-check", "/apply/fee", "/apply/declaration", "/review"].includes(e.page)),
    statementNeverWrittenByExtension: !byExtension.some((e) => e.target === "statement" && e.type !== "click"),
    serviceWorkerOnlySupabase: sw.length > 0 && sw.every((r) => new URL(r.url).origin === supabase),
    serviceWorkerRequests: sw.length,
    nothingUnattributed: session.every((r) => r.from !== "other"),
    portalTabOnlyPortal: session.filter((r) => r.from === PORTAL).every((r) => new URL(r.url).origin === PORTAL),
    panelNoNetwork: session.filter((r) => r.from === "extension panel").every((r) => r.url.startsWith(`chrome-extension://${ID}/`)),
    cspConnectSrc: supabase,
    reaNavigationsAllInScope: nav.every((n) => !n.scope || n.scope === "approved"),
    reaRecordedFromStart: nav.some((n) => n.url === "/"),
    reaFormSubmissions: nav.filter((n) => n.detail === "formsubmissionpost").length,
    auditEventsHaveNoValueColumn: !/value|text|body/.test(eventColumns),
  };
  const out = {
    when: new Date().toISOString(),
    extension: { id: ID, build: "test (EXT_TEST=1)", permissions: manifest.permissions, host_permissions: manifest.host_permissions, csp: manifest.content_security_policy.extension_pages },
    checks,
    pauses,
    reviewSummaryInPanel: summary,
    fieldsChangedByExtension: fieldsByExtension,
    scriptedEventsOnPortal: scripted,
    auditLog: { run, columns: eventColumns, events },
    requestsDuringRun: byFrom,
    serviceWorkerRequests: sw.map((r) => ({ method: r.method, url: r.url.replace(supabase, "<supabase>").replace(/\?.*$/, "?…") })),
    rea: {
      observe: { window: observe.window, completeness: observe.completeness.status, navigation: nav, limitations: observe.limitations },
      inspectAtReview: { url: insp.target.url, networkRequestsInWindow: insp.network.requests.length, storage: insp.storage, linkDestinations: [...new Set(insp.metadata.dom_urls.map((u) => u.destination_scope))] },
    },
  };
  fs.writeFileSync(path.join(outDir, "session.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(checks, null, 2));
  await ctx.close();
  portalServer.kill();
  fs.rmSync(profile, { recursive: true, force: true });
  reset();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
