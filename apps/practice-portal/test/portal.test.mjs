// Smoke tests for the practice portal (M7, A1.2): it behaves like a real portal in the ways the extension must
// handle, so the extension's own tests can rely on it.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PAGE_IDS } from "../pages.mjs";
import { server } from "../server.mjs";

let base = "";
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function signIn() {
  const res = await fetch(`${base}/sign-in`, {
    method: "POST",
    body: new URLSearchParams({ email: "tester@practice.test", password: "practice-only" }),
    redirect: "manual",
  });
  assert.equal(res.status, 303);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  return (path, form) =>
    fetch(`${base}${path}`, { method: form ? "POST" : "GET", headers: { cookie }, body: form ? new URLSearchParams(form) : undefined, redirect: "manual" });
}

test("signing in is required, and a wrong password is refused", async () => {
  assert.equal((await fetch(`${base}/`, { redirect: "manual" })).headers.get("location"), "/sign-in");
  const bad = await fetch(`${base}/sign-in`, { method: "POST", body: new URLSearchParams({ email: "tester@practice.test", password: "nope" }) });
  assert.equal(bad.status, 401);
});

test("required and conditional fields are checked; a conditional one only when shown", async () => {
  const go = await signIn();
  let res = await go("/apply/schooling", { action: "continue", school_name: "City School" });
  assert.equal(res.status, 422);
  assert.match(await res.text(), /Qualification: please answer this/);
  res = await go("/apply/schooling", {
    action: "continue", school_name: "City School", qualification: "cbse_12", grade_scale: "percentage", grade_value: "91.4", still_studying: "no",
  });
  assert.equal(res.status, 303, "the completion date isn't needed when not still studying");
  res = await go("/apply/schooling", {
    action: "continue", school_name: "City School", qualification: "cbse_12", grade_scale: "percentage", grade_value: "91.4", still_studying: "yes",
  });
  assert.match(await res.text(), /When do you expect to finish\?: please answer this/);
  const page = await (await go("/apply/schooling")).text();
  assert.match(page, /data-show-field="still_studying" data-show-equals="yes"/);
});

test("activities repeat with 'Add another activity', and need at least one", async () => {
  const go = await signIn();
  assert.equal((await go("/apply/activities", { action: "continue" })).status, 422);
  await go("/apply/activities", { action: "add", activity_1_role: "Robotics club lead" });
  const html = await (await go("/apply/activities")).text();
  assert.match(html, /id="activity-2"/);
  assert.match(html, /value="Robotics club lead"/);
});

test("the statement's word limit, the security word and the fee each hold the page", async () => {
  const go = await signIn();
  const long = Array.from({ length: 651 }, () => "word").join(" ");
  assert.match(await (await go("/apply/statement", { action: "continue", statement: long })).text(), /keep it to 650 words/);
  assert.match(await (await go("/apply/security-check", { action: "continue", check_word: "practice" })).text(), /doesn(?:'|&#39;)t match/);
  assert.match(await (await go("/apply/fee", { action: "continue" })).text(), /Pay the fee or ask for a fee waiver/);
  const fee = await (await go("/apply/fee")).text();
  assert.match(fee, /id="pay-fee"/);
  assert.match(fee, /id="field-fee_waiver"/);
});

test("a full application reaches the review page and, only when submitted there, the confirmation", async () => {
  const go = await signIn();
  const answers = {
    "about-you": { given_names: "Test", family_name: "Student", email: "tester@practice.test", date_of_birth: "2007-05-01", country_of_residence: "IN" },
    schooling: { school_name: "City School", qualification: "cbse_12", grade_scale: "percentage", grade_value: "91.4", still_studying: "no" },
    tests: { english_test_taken: "yes", english_test: "ielts_academic", english_overall: "7.5" },
    activities: { activity_1_role: "Robotics club lead", activity_1_organisation: "City School" },
    statement: { statement: "My own words about why I want to study this course." },
    "security-check": { check_word: "PRACTICE" },
    fee: { fee_waiver: "on", fee_waiver_reason: "Synthetic test reason" },
    declaration: { declare: "on", signed_name: "Test Student" },
  };
  for (const id of PAGE_IDS) {
    const res = await go(`/apply/${id}`, { action: "continue", ...answers[id] });
    assert.equal(res.status, 303, `${id} continues`);
  }
  const review = await (await go("/review")).text();
  assert.match(review, /Check your application/);
  assert.match(review, /id="submit-application"/);
  assert.equal((await go("/confirmation")).status, 404, "no confirmation before submitting");
  const submitted = await go("/review", { action: "submit" });
  assert.equal(submitted.headers.get("location"), "/confirmation");
  assert.match(await (await go("/confirmation")).text(), /We(?:'|&#39;)ve received your application/);
});

test("withdrawing is a real, dangerous action on the dashboard", async () => {
  const go = await signIn();
  assert.match(await (await go("/")).text(), /id="withdraw-application"/);
  assert.match(await (await go("/withdraw", {})).text(), /has been withdrawn/);
});

test("the recorded map (A1.2) still matches the portal", async () => {
  const { readFile } = await import("node:fs/promises");
  const { PAGES, NEVER_CLICK } = await import("../pages.mjs");
  const map = JSON.parse(await readFile(new URL("../../../packages/portal-adapters/practice/map.json", import.meta.url), "utf8"));
  assert.deepEqual(map.pages.map((p) => p.id), PAGE_IDS, "page order");
  for (const page of PAGES) {
    const mapped = map.pages.find((p) => p.id === page.id);
    const names = (page.group ? page.group.fields.map((f) => `activity_{n}_${f.name}`) : page.fields.map((f) => f.name)).sort();
    assert.deepEqual(mapped.fields.map((f) => f.find.name ?? f.find.namePattern).sort(), names, `${page.id} fields`);
    for (const f of page.fields ?? []) {
      const m = mapped.fields.find((x) => x.find.name === f.name);
      assert.equal(m.required, f.required, `${f.name} required`);
      assert.deepEqual(m.showWhen, f.showWhen, `${f.name} condition`);
      if (f.neverClick || f.neverFill) assert.equal(m.action, "never", `${f.name} is never touched`);
    }
  }
  const never = new Set(map.neverClick.map((n) => n.id));
  for (const n of NEVER_CLICK) assert.ok(never.has(n.id), `${n.id} is never-click in the map`);
  for (const a of map.allowedClicks) assert.ok(!never.has(a.id), `${a.id} can't be both`);
});

test("test builds can show a changed page, which renames its first required question", async () => {
  const go = await signIn();
  await fetch(`${base}/__variant?page=schooling&variant=changed`, { method: "POST" });
  const html = await (await go("/apply/schooling")).text();
  assert.match(html, /id="field-school_name_v2"/);
  assert.doesNotMatch(html, /id="field-school_name"/);
  await fetch(`${base}/__variant?page=schooling`, { method: "POST" });
  assert.match(await (await go("/apply/schooling")).text(), /id="field-school_name"/);
});
