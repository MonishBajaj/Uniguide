// The practice portal (M7, A1.2): a small, dependency-free application portal we own, for developing and testing
// the extension and for REA observation without touching any real portal. Server-rendered pages with ordinary
// forms, so moving between pages is a real navigation, like most portals.
//
// Run: node apps/practice-portal/server.mjs  (PORT, default 4318; PRACTICE_TEST=1 enables POST /__reset)
// Sign in with the synthetic account: tester@practice.test / practice-only

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { PAGES, PAGE_IDS, SECTIONS } from "./pages.mjs";

const PORT = Number(process.env.PORT ?? 4318);
const TEST = process.env.PRACTICE_TEST === "1";
const ACCOUNT = { email: "tester@practice.test", password: "practice-only" };

/** @type {Map<string, any>} */
const sessions = new Map();

function newApplication() {
  return { answers: {}, activities: [{}], done: new Set(), paid: false, signed: false, submitted: null, withdrawn: false };
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout(title, body, { signedIn = true, sectionId = null } = {}) {
  const nav = signedIn
    ? `<nav aria-label="Application sections"><ol class="sections">${SECTIONS.map(
        (s) => `<li${s.id === sectionId ? ' aria-current="step"' : ""}>${esc(s.title)}</li>`,
      ).join("")}</ol></nav>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Practice Portal</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#1c1c1c;background:#fafaf7}
header{display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:#2d3a4a;color:#fff}
header a,header button{color:#fff;background:transparent;border:1px solid #fff}
.banner{background:#fff4cc;padding:8px 24px;font-size:14px}
main{max-width:720px;margin:0 auto;padding:24px}
.sections{display:flex;gap:16px;list-style:none;padding:0;font-size:14px;flex-wrap:wrap}
.sections [aria-current]{font-weight:700;text-decoration:underline}
label{display:block;font-weight:600;margin-top:16px}
input[type=text],input[type=email],input[type=tel],input[type=date],input[type=month],select,textarea{display:block;width:100%;max-width:480px;padding:8px;margin-top:4px;font:inherit}
textarea{min-height:120px}
fieldset{border:1px solid #ccc;margin-top:16px;padding:12px}
.hint{color:#555;font-size:14px}
.errors{border:2px solid #b00020;padding:12px;margin:16px 0}
.actions{margin-top:24px;display:flex;gap:12px;flex-wrap:wrap}
button{font:inherit;padding:8px 16px}
.danger{background:#b00020;color:#fff;border:0}
[hidden]{display:none}
</style></head>
<body>
<header><span>Practice Portal</span>${signedIn ? `<form method="post" action="/sign-out"><button id="sign-out">Sign out</button></form>` : ""}</header>
<p class="banner" role="note">A practice portal for testing only. Never enter real personal details here.</p>
<main>${nav}<h1>${esc(title)}</h1>${body}</main>
<script>
// Conditional questions: show a question only when the answer it depends on matches.
function refresh(){document.querySelectorAll("[data-show-field]").forEach(function(el){
  var f=el.getAttribute("data-show-field"),want=el.getAttribute("data-show-equals");
  var inputs=document.querySelectorAll('[name="'+f+'"]'),val="";
  inputs.forEach(function(i){if((i.type==="radio"||i.type==="checkbox")){if(i.checked)val=i.type==="checkbox"?"on":i.value}else{val=i.value}});
  el.hidden=val!==want;});}
document.addEventListener("change",refresh);document.addEventListener("input",refresh);refresh();
</script>
</body></html>`;
}

function visible(field, answers) {
  if (!field.showWhen) return true;
  return (answers[field.showWhen.field] ?? "") === field.showWhen.equals;
}

function fieldHtml(field, value, idPrefix = "field-", name = field.name) {
  const id = `${idPrefix}${name}`;
  const hint = field.hint ? `<span class="hint" id="${id}-hint">${esc(field.hint)}</span>` : "";
  const described = field.hint ? ` aria-describedby="${id}-hint"` : "";
  const req = field.required ? " required" : "";
  let control;
  switch (field.type) {
    case "select":
      control = `<select id="${id}" name="${name}"${req}${described}>${field.options
        .map(([v, l]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(l)}</option>`)
        .join("")}</select>`;
      return `<label for="${id}">${esc(field.label)}</label>${hint}${control}`;
    case "radio":
      return `<fieldset id="${id}"${described}><legend>${esc(field.label)}</legend>${hint}${field.options
        .map(
          ([v, l]) =>
            `<label><input type="radio" id="${id}-${v}" name="${name}" value="${esc(v)}"${v === value ? " checked" : ""}${req}> ${esc(l)}</label>`,
        )
        .join("")}</fieldset>`;
    case "checkbox":
      return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}"${value === "on" ? " checked" : ""}${req}> ${esc(field.label)}</label>`;
    case "textarea": {
      const limit = field.wordLimit ? ` data-word-limit="${field.wordLimit}"` : "";
      const max = field.maxlength ? ` maxlength="${field.maxlength}"` : "";
      return `<label for="${id}">${esc(field.label)}</label>${hint}<textarea id="${id}" name="${name}"${req}${described}${limit}${max}>${esc(value)}</textarea>`;
    }
    default:
      return `<label for="${id}">${esc(field.label)}</label>${hint}<input type="${field.type}" id="${id}" name="${name}" value="${esc(value)}"${req}${described}${field.autocomplete ? ` autocomplete="${field.autocomplete}"` : ""}>`;
  }
}

function wrapConditional(field, html, answers) {
  if (!field.showWhen) return `<div class="question">${html}</div>`;
  return `<div class="question" data-show-field="${field.showWhen.field}" data-show-equals="${field.showWhen.equals}"${visible(field, answers) ? "" : " hidden"}>${html}</div>`;
}

const words = (s) => (String(s ?? "").trim().match(/\S+/g) ?? []).length;

function validate(page, app) {
  const errors = [];
  const a = app.answers;
  for (const f of page.fields ?? []) {
    if (!visible(f, a)) continue;
    const v = a[f.name] ?? "";
    if (f.required && f.type === "checkbox" ? v !== "on" : f.required && !String(v).trim()) errors.push(`${f.label}: please answer this.`);
    if (f.wordLimit && words(v) > f.wordLimit) errors.push(`${f.label}: keep it to ${f.wordLimit} words (you have ${words(v)}).`);
  }
  if (page.group) {
    const filled = app.activities.filter((x) => String(x.role ?? "").trim());
    if (filled.length < page.group.min) errors.push("Add at least one activity.");
  }
  if (page.security && a.check_word !== "PRACTICE") errors.push("The security word doesn't match.");
  if (page.fee && !app.paid && a.fee_waiver !== "on") errors.push("Pay the fee or ask for a fee waiver to continue.");
  return errors;
}

function pageHtml(page, app, errors = []) {
  const a = app.answers;
  const idx = PAGE_IDS.indexOf(page.id);
  const back = idx > 0 ? `/apply/${PAGE_IDS[idx - 1]}` : "/";
  // Test builds only: a "changed" page renames its first required question, as a portal update might.
  const changed = variants.get(page.id) === "changed";
  let renamed = false;
  let fields = (page.fields ?? [])
    .map((f) => {
      const rename = changed && !renamed && f.required && !f.showWhen;
      if (rename) renamed = true;
      return wrapConditional(f, fieldHtml(f, a[f.name] ?? "", "field-", rename ? `${f.name}_v2` : f.name), a);
    })
    .join("");
  if (page.group) {
    fields += app.activities
      .map(
        (act, i) =>
          `<fieldset id="activity-${i + 1}"><legend>Activity ${i + 1}</legend>${page.group.fields
            .map((f) => fieldHtml({ ...f, required: f.required && i === 0 }, act[f.name] ?? "", "field-", `activity_${i + 1}_${f.name}`))
            .join("")}</fieldset>`,
      )
      .join("");
  }
  let extra = "";
  if (page.fee) {
    extra = app.paid
      ? `<p id="fee-status">Fee paid.</p>`
      : `<p id="fee-status">The application fee is 20 practice pounds.</p><p><button class="danger" id="pay-fee" formaction="/fee/pay" formmethod="post">Pay the fee</button></p>`;
  }
  const errorBox = errors.length
    ? `<div class="errors" role="alert" id="error-summary"><h2>There is a problem</h2><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`
    : "";
  const buttons = page.declaration
    ? `<button id="sign-continue" name="action" value="continue">Sign and continue</button>`
    : `<button id="save-continue" name="action" value="continue">Save and continue</button>
       <button id="save-only" name="action" value="save">Save</button>
       ${page.group && app.activities.length < page.group.max ? `<button id="add-activity" name="action" value="add">Add another activity</button>` : ""}`;
  return layout(
    page.title,
    `${errorBox}<form method="post" action="/apply/${page.id}" novalidate data-page="${page.id}">${fields}${extra}
      <div class="actions">${buttons}<a id="back" href="${back}">Back</a></div></form>`,
    { sectionId: page.section },
  );
}

function reviewHtml(app) {
  const a = app.answers;
  const rows = PAGES.flatMap((p) =>
    (p.fields ?? [])
      .filter((f) => visible(f, a) && f.type !== "checkbox" && !p.security)
      .map((f) => `<tr><th scope="row">${esc(f.label)}</th><td>${esc(a[f.name] ?? "")}</td><td><a href="/apply/${p.id}">Change<span hidden> ${esc(f.label)}</span></a></td></tr>`),
  );
  const acts = app.activities
    .filter((x) => x.role)
    .map((x, i) => `<tr><th scope="row">Activity ${i + 1}</th><td>${esc(x.role)}${x.organisation ? `, ${esc(x.organisation)}` : ""}</td><td><a href="/apply/activities">Change</a></td></tr>`);
  return layout(
    "Check your application",
    `<p>Check every answer. When you submit, you can't change it.</p>
     <table id="review-table"><tbody>${[...rows, ...acts].join("")}</tbody></table>
     <form method="post" action="/review"><div class="actions"><button class="danger" id="submit-application" name="action" value="submit">Submit my application</button>
     <a id="back" href="/apply/declaration">Back</a></div></form>`,
  );
}

function dashboardHtml(app) {
  const next = PAGE_IDS.find((id) => !app.done.has(id)) ?? "review";
  const href = next === "review" ? "/review" : `/apply/${next}`;
  return layout(
    "Your application",
    `<p id="status">${app.submitted ? `Submitted. Reference ${esc(app.submitted)}.` : app.withdrawn ? "Withdrawn." : "In progress."}</p>
     <ul>${SECTIONS.map((s) => {
       const pages = PAGES.filter((p) => p.section === s.id).map((p) => p.id);
       const complete = pages.every((id) => app.done.has(id));
       return `<li>${esc(s.title)}: ${complete ? "complete" : "not complete"}</li>`;
     }).join("")}</ul>
     <p><a id="continue-application" href="${href}">Continue your application</a></p>
     <form method="post" action="/withdraw"><button class="danger" id="withdraw-application">Withdraw this application</button></form>`,
  );
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(data))));
  });
}

function send(res, status, html, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(html);
}
const redirect = (res, to, headers = {}) => {
  res.writeHead(303, { location: to, ...headers });
  res.end();
};

function session(req) {
  const id = /(?:^|; )pp_session=([a-f0-9]+)/.exec(req.headers.cookie ?? "")?.[1];
  return id && sessions.has(id) ? { id, ...sessions.get(id) } : null;
}

/** Test-only page variants (PRACTICE_TEST=1), by page id. */
const variants = new Map();

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const s = session(req);

  if (TEST && req.method === "POST" && path === "/__reset") {
    sessions.clear();
    variants.clear();
    return send(res, 200, "reset");
  }
  // POST /__variant?page=<id>&variant=changed (or nothing, to undo): test builds only.
  if (TEST && req.method === "POST" && path === "/__variant") {
    const pageId = url.searchParams.get("page") ?? "";
    const variant = url.searchParams.get("variant");
    if (variant) variants.set(pageId, variant);
    else variants.delete(pageId);
    return send(res, 200, "variant");
  }
  if (path === "/sign-in") {
    if (req.method === "POST") {
      const body = await readBody(req);
      if (body.email === ACCOUNT.email && body.password === ACCOUNT.password) {
        const id = randomBytes(16).toString("hex");
        sessions.set(id, { app: newApplication() });
        return redirect(res, "/", { "set-cookie": `pp_session=${id}; Path=/; HttpOnly; SameSite=Lax` });
      }
      return send(res, 401, signInHtml("That email and password don't match the practice account."), {});
    }
    return send(res, 200, signInHtml());
  }
  if (!s) return redirect(res, "/sign-in");
  const app = s.app;

  if (req.method === "POST" && path === "/sign-out") {
    sessions.delete(s.id);
    return redirect(res, "/sign-in", { "set-cookie": "pp_session=; Path=/; Max-Age=0" });
  }
  if (path === "/") return send(res, 200, dashboardHtml(app));
  if (req.method === "POST" && path === "/withdraw") {
    app.withdrawn = true;
    return send(res, 200, layout("Application withdrawn", `<p id="withdrawn">Your application has been withdrawn.</p>`));
  }
  if (req.method === "POST" && path === "/fee/pay") {
    app.paid = true;
    return redirect(res, "/apply/fee");
  }
  const pageMatch = /^\/apply\/([a-z-]+)$/.exec(path);
  if (pageMatch) {
    const page = PAGES.find((p) => p.id === pageMatch[1]);
    if (!page) return send(res, 404, layout("Page not found", "<p>That page doesn't exist.</p>"));
    if (req.method === "POST") {
      const body = await readBody(req);
      for (const f of page.fields ?? []) app.answers[f.name] = f.type === "checkbox" ? (body[f.name] === "on" ? "on" : "") : (body[f.name] ?? "");
      if (page.group) {
        app.activities = app.activities.map((_, i) =>
          Object.fromEntries(page.group.fields.map((f) => [f.name, body[`activity_${i + 1}_${f.name}`] ?? ""])),
        );
        if (body.action === "add" && app.activities.length < page.group.max) app.activities.push({});
      }
      if (body.action === "continue") {
        const errors = validate(page, app);
        if (errors.length) return send(res, 422, pageHtml(page, app, errors));
        app.done.add(page.id);
        if (page.declaration) app.signed = true;
        const next = PAGE_IDS[PAGE_IDS.indexOf(page.id) + 1];
        return redirect(res, next ? `/apply/${next}` : "/review");
      }
      return redirect(res, path);
    }
    return send(res, 200, pageHtml(page, app));
  }
  if (path === "/review") {
    if (req.method === "POST") {
      const missing = PAGE_IDS.filter((id) => !app.done.has(id));
      if (missing.length) return send(res, 422, layout("Not ready to submit", `<p id="not-ready">Finish these first: ${missing.map(esc).join(", ")}.</p>`));
      app.submitted = `PP-${randomBytes(3).toString("hex").toUpperCase()}`;
      return redirect(res, "/confirmation");
    }
    return send(res, 200, reviewHtml(app));
  }
  if (path === "/confirmation" && app.submitted) {
    return send(res, 200, layout("Application received", `<p id="confirmation">We've received your application. Your reference is <strong id="reference">${esc(app.submitted)}</strong>.</p>`));
  }
  return send(res, 404, layout("Page not found", "<p>That page doesn't exist.</p>"));
});

function signInHtml(error = "") {
  return layout(
    "Sign in",
    `${error ? `<div class="errors" role="alert">${esc(error)}</div>` : ""}
     <form method="post" action="/sign-in"><label for="email">Email address</label><input type="email" id="email" name="email" autocomplete="username">
     <label for="password">Password</label><input type="password" id="password" name="password" autocomplete="current-password">
     <div class="actions"><button id="sign-in">Sign in</button></div></form>`,
    { signedIn: false },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, "127.0.0.1", () => console.log(`Practice portal on http://127.0.0.1:${PORT}`));
}
