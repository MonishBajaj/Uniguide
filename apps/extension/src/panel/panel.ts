// The side panel (spec 5.3): one row per field, with Fill, Copy and Leave for me. No "fill all". Everything it
// shows is built from text nodes, never HTML, because portal labels come from the page.
import { CONFIDENT } from "@uniguide/portal-adapters";
import { TEST_BUILD, WEB_ORIGIN } from "../config";
import type { AccountState, BackgroundReply, FillResult, ScanResult, ToBackground, ToContent } from "../messages";
import { DICTS, pickLocale, type MsgKey } from "./i18n";
import { applyFill, buildRows, copied, dismissPrompt, initial, logFor, phaseOf, skipped, sourceKey, type PanelState, type Row } from "./state";

const locale = pickLocale(navigator.languages);
const t = DICTS[locale];
document.documentElement.lang = locale;
const app = document.getElementById("app")!;

let state: PanelState = initial();
let tabId: number | undefined;
let runStarted = false;
let busy = false;
let failed = false;

// While this port is open the background knows the panel is; closing the panel ends the run.
chrome.runtime.connect({ name: "panel" });

// ---------------------------------------------------------------------------------------------- talking

class Failed extends Error {}

async function bg<T>(msg: ToBackground): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(msg)) as BackgroundReply<T> | undefined;
  if (reply?.ok) return reply.data;
  if (reply?.error === "signed_out") {
    state = { ...initial(), account: { signedIn: false, email: null, consent: "unknown", applications: [] } };
    render();
  }
  throw new Failed(reply && !reply.ok ? (reply.detail ?? reply.error) : "no reply");
}

async function toPage<T>(msg: ToContent): Promise<T | null> {
  if (tabId === undefined) return null;
  try {
    return ((await chrome.tabs.sendMessage(tabId, msg)) as T | undefined) ?? null;
  } catch {
    return null; // no content script here: not a supported portal page
  }
}

async function findTab(): Promise<number | undefined> {
  const asked = TEST_BUILD ? new URLSearchParams(location.search).get("tab") : null;
  if (asked) return Number(asked);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

const log = (row: Row, kind: Parameters<typeof logFor>[2], reason: string | null = null) =>
  bg(logFor(state, row, kind, reason)).catch(() => {});

// ---------------------------------------------------------------------------------------------- flow

async function load() {
  failed = false;
  tabId = await findTab();
  state = { ...initial(), account: await bg<AccountState>({ to: "background", type: "state" }) };
  render();
}

async function choose(applicationId: string) {
  const profile = await bg<PanelState["profile"]>({ to: "background", type: "profile", applicationId });
  runStarted = false;
  state = { ...state, applicationId, profile };
  await rescan();
}

async function rescan() {
  const scan = await toPage<ScanResult>({ to: "content", type: "scan" });
  const before = state.rows;
  const samePage = state.scan?.page.pageId === scan?.page.pageId;
  const rows = buildRows(scan, state.profile).map((r) => {
    const old = samePage ? before.find((o) => o.key === r.key && o.index === r.index) : undefined;
    return old ? { ...r, status: old.status } : r;
  });
  const { prompt: _p, notice: _n, ...rest } = state;
  state = { ...rest, scan, rows };
  if (phaseOf(state) === "ready" && !runStarted && state.applicationId && scan) {
    runStarted = true;
    await bg({ to: "background", type: "start", applicationId: state.applicationId, portal: scan.portal, adapterVersion: scan.adapterVersion }).catch(() => {
      runStarted = false;
    });
  }
  render();
}

async function doFill(row: Row, overwrite = false, value = row.value) {
  if (value === undefined || busy) return;
  busy = true;
  try {
    const result =
      (await toPage<FillResult>({ to: "content", type: "fill", key: row.key, ...(row.index ? { index: row.index } : {}), value, overwrite })) ??
      ({ status: "not_found" } as FillResult);
    state = applyFill(state, row.key, row.index, result);
    if (result.status === "confirm_overwrite" && state.prompt) state.prompt.value = value;
    if (result.status === "filled") await log(row, row.group === "essay" ? "pasted_draft" : "filled");
    if (result.status === "blocked") await log(row, "blocked", result.logReason);
  } finally {
    busy = false;
    render();
  }
}

async function doCopy(row: Row, text = row.value, kind: "copied" | "copied_draft" = "copied") {
  if (text === undefined) return;
  await navigator.clipboard.writeText(text);
  state = { ...copied(state, row.key, row.index), notice: { key: row.key, text: "copiedNotice" } };
  await log(row, kind);
  render();
}

async function doSkip(row: Row) {
  state = skipped(state, row.key, row.index);
  await log(row, "skipped");
  render();
}

async function draftText(row: Row): Promise<string | null> {
  const choice = row.draft?.choices[0];
  if (!choice) return null;
  return bg<string | null>({ to: "background", type: "draft", documentId: choice.documentId });
}

chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === tabId && info.status === "complete" && phaseOf(state) !== "loading" && state.profile) void rescan();
});

// ---------------------------------------------------------------------------------------------- drawing

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | ((e: Event) => void)> = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const button = (label: string, on: () => void, attrs: Record<string, string> = {}) =>
  h("button", { type: "button", ...attrs, onclick: () => void on() }, label);

function render() {
  const phase = phaseOf(state);
  const s = state;
  const parts: Child[] = [h("h1", {}, t.title)];
  if (s.account?.signedIn && s.account.email) {
    parts.push(h("p", { class: "account" }, t.signedInAs(s.account.email), " ", button(t.signOut, signOutNow, { class: "link" })));
  }
  switch (failed ? "failed" : phase) {
    case "failed":
      parts.push(h("p", { role: "alert" }, t.loadFailed), button(t.retry, () => load().catch(onLoadFailed)));
      break;
    case "loading":
      parts.push(h("p", {}, t.loading));
      break;
    case "signed_out":
      parts.push(h("h2", {}, t.signedOutTitle), h("p", {}, t.signedOutBody), button(t.connect, () => bg({ to: "background", type: "connect" })));
      break;
    case "consent": {
      const c = s.account!.consent;
      const text = c === "pending_parental" ? t.consentPending : c === "revoked" ? t.consentRevoked : t.consentUnknown;
      const href = c === "pending_parental" ? `${WEB_ORIGIN}/consent` : `${WEB_ORIGIN}/app/profile`;
      parts.push(h("p", { role: "alert", id: "consent-reason" }, text), h("p", {}, h("a", { href, target: "_blank", rel: "noopener" }, t.fixInUniguide)));
      break;
    }
    case "choose":
      parts.push(chooser());
      break;
    case "unsupported":
      parts.push(h("p", { id: "unsupported" }, t.unsupported), button(t.checkAgain, rescan));
      break;
    case "ready":
      parts.push(...rowsView());
      break;
  }
  if (s.notice && !s.notice.key) parts.push(h("p", { role: "status" }, t[s.notice.text]));
  app.replaceChildren(...parts.filter((p): p is Node | string => !!p));
}

function chooser(): Node {
  const apps = state.account!.applications;
  if (apps.length === 0) return h("p", {}, t.noApplications);
  const select = h("select", { id: "application" }, ...apps.map((a) => h("option", { value: a.id }, a.institution ? `${a.title}, ${a.institution}` : a.title)));
  return h(
    "form",
    { onsubmit: (e: Event) => (e.preventDefault(), void choose(select.value)) },
    h("h2", {}, t.chooseTitle),
    h("label", { for: "application" }, t.chooseHelp),
    select,
    h("button", { type: "submit" }, t.choose),
  );
}

const GROUPS: [Row["group"], MsgKey][] = [
  ["fill", "groupFill"],
  ["essay", "groupEssay"],
  ["review", "groupReview"],
  ["yours", "groupYours"],
];

function rowsView(): Child[] {
  const s = state;
  const out: Child[] = [];
  if (s.scan && !s.scan.page.matchesMap) out.push(h("p", { role: "alert" }, t.pageMismatch));
  if (s.prompt) out.push(promptView());
  for (const [group, title] of GROUPS) {
    const rows = s.rows.filter((r) => r.group === group);
    if (rows.length === 0) continue;
    out.push(h("section", { "aria-labelledby": `g-${group}` }, h("h2", { id: `g-${group}` }, t[title]), h("ul", { class: "rows" }, ...rows.map(rowView))));
  }
  out.push(button(t.checkAgain, rescan, { class: "secondary" }));
  return out;
}

function promptView(): Node {
  const p = state.prompt!;
  const row = state.rows.find((r) => r.key === p.key && r.index === p.index);
  return h(
    "div",
    { role: "alertdialog", "aria-labelledby": "ow-title", "aria-describedby": "ow-body", class: "prompt", id: "overwrite" },
    h("h2", { id: "ow-title" }, t.overwriteTitle),
    h("p", { id: "ow-body" }, t.overwriteBody(p.current, row?.group === "essay" ? "…" : p.value)),
    button(t.replace, () => (row ? doFill(row, true, p.value) : undefined)),
    button(t.keep, () => ((state = dismissPrompt(state)), render()), { class: "secondary" }),
  );
}

function rowView(row: Row): Node {
  const id = `row-${row.key}${row.index ? `-${row.index}` : ""}`;
  const name = `${row.label}${row.index && row.index > 1 ? ` (${row.index})` : ""}`;
  const meta: Child[] = [];
  if (row.via === "map") meta.push(t.confidenceMap);
  else if (row.via === "label") {
    const pct = Math.round(row.confidence * 100);
    meta.push(row.confidence >= CONFIDENT ? t.confidenceLabel(pct) : t.confidenceLow(pct));
  }
  if (row.required) meta.push(` · ${t.required}`);

  const body: Child[] = [h("span", { class: "label", id: `${id}-label` }, name), h("span", { class: "meta" }, ...meta)];
  const actions: Child[] = [];
  const done = row.status !== "ready";

  if (row.group === "fill") {
    body.push(h("span", { class: "value" }, row.shown ?? row.value ?? ""), row.source ? h("span", { class: "source" }, t[sourceKey(row.source)]) : null);
    actions.push(
      button(t.fill, () => doFill(row), { "aria-label": `${t.fill}: ${name}` }),
      button(t.copy, () => doCopy(row), { "aria-label": `${t.copy}: ${name}`, class: "secondary" }),
      button(t.skip, () => doSkip(row), { "aria-label": `${t.skip}: ${name}`, class: "secondary" }),
    );
  } else if (row.group === "essay") {
    const choice = row.draft?.choices[0];
    if (!row.draft || !choice) body.push(h("span", { class: "reason" }, t.essayNoDraft));
    else {
      if (!choice.fits && row.draft && choice.wordCount) {
        const limit = state.scan?.fields.find((f) => f.key === row.key)?.wordLimit ?? 0;
        body.push(h("span", { class: "reason" }, t.essayTooLong(choice.wordCount, limit)));
      }
      if (row.draft.paste && choice.fits) {
        actions.push(button(t.paste, async () => {
          const text = await draftText(row);
          if (text) await doFill(row, false, text);
        }, { "aria-label": `${t.paste}: ${name}` }));
      } else if (!row.draft.paste) body.push(h("span", { class: "reason" }, t.essayCopyOnly));
      actions.push(button(t.copyDraft, async () => {
        const text = await draftText(row);
        if (text) await doCopy(row, text, "copied_draft");
      }, { "aria-label": `${t.copyDraft}: ${name}`, class: "secondary" }));
    }
  } else {
    const key = `reason_${row.reason ?? "no_match"}` as MsgKey;
    body.push(h("span", { class: "reason" }, key in t ? (t[key] as string) : t.reason_no_match));
    if (row.group === "review") actions.push(button(t.skip, () => doSkip(row), { "aria-label": `${t.skip}: ${name}`, class: "secondary" }));
  }

  const statusKey: Partial<Record<Row["status"], MsgKey>> = {
    filled: "statusFilled",
    copied: "statusCopied",
    skipped: "statusSkipped",
    blocked: "statusBlocked",
    no_option: "statusNoOption",
    too_long: "statusTooLong",
  };
  const status = statusKey[row.status];
  const notice = state.notice?.key === row.key ? t[state.notice.text] : null;
  return h(
    "li",
    { id, class: `row ${done ? "done" : ""}`, "data-role": row.role ?? "", "data-status": row.status },
    h("div", { class: "body" }, ...body),
    status ? h("span", { class: "status", role: "status" }, t[status]) : null,
    notice && notice !== (status ? t[status] : null) ? h("span", { class: "notice", role: "status" }, notice) : null,
    actions.length ? h("div", { class: "actions" }, ...actions) : null,
  );
}

async function signOutNow() {
  await bg({ to: "background", type: "signOut" }).catch(() => {});
  state = { ...initial(), account: { signedIn: false, email: null, consent: "unknown", applications: [] } };
  render();
}

/** A failure to reach UniGuide says so; it isn't shown as being signed out (that has its own reply). */
function onLoadFailed() {
  if (state.account && !state.account.signedIn) return;
  failed = true;
  render();
}

render();
void load().catch(onLoadFailed);
