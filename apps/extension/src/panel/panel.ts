// The side panel (spec 5.3): one row per field, with Fill, Copy and Leave for me. No "fill all". Everything it
// shows is built from text nodes, never HTML, because portal labels come from the page.
import { CONFIDENT, planPage, type Role } from "@uniguide/portal-adapters";
import { adapterByPortal } from "../adapters";
import { TEST_BUILD, WEB_ORIGIN } from "../config";
import type { AccountState, BackgroundReply, FillResult, PressResult, ScanResult, SuggestOutcome, ToBackground, ToContent } from "../messages";
import { GuidedRunner } from "./guided";
import { DICTS, pickLocale, type MsgKey } from "./i18n";
import {
  applyFill,
  asking,
  buildRows,
  canFill,
  canSuggest,
  confirmSuggestion,
  copied,
  dismissPrompt,
  gotSuggestion,
  initial,
  logFor,
  phaseOf,
  rejectSuggestion,
  skipped,
  sourceKey,
  type PanelState,
  type Row,
} from "./state";

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
    return old ? { ...r, status: old.status, ...(old.suggestion ? { suggestion: old.suggestion } : {}) } : r;
  });
  const { prompt: _p, notice: _n, ...rest } = state;
  state = { ...rest, scan, rows };
  // A suggestion the student confirmed on this page stays confirmed.
  for (const old of samePage ? before : []) {
    if (old.confirmedRole) state = confirmSuggestion(state, old.key, old.index);
  }
  if (phaseOf(state) === "ready" && !runStarted && state.applicationId && scan) {
    runStarted = true;
    await bg({ to: "background", type: "start", applicationId: state.applicationId, portal: scan.portal, adapterVersion: scan.adapterVersion, feature: "fill" }).catch(() => {
      runStarted = false;
    });
  }
  render();
}

async function doFill(row: Row, overwrite = false, value = row.value) {
  if (value === undefined || busy) return;
  // A suggested role is filled only after the student has confirmed it (A1.6).
  if (row.group === "fill" && !canFill(row)) return;
  if (row.via === "suggested" && !row.confirmedRole) return;
  busy = true;
  try {
    const result =
      (await toPage<FillResult>({
        to: "content",
        type: "fill",
        key: row.key,
        ...(row.index ? { index: row.index } : {}),
        value,
        overwrite,
        ...(row.confirmedRole ? { confirmedRole: row.confirmedRole } : {}),
      })) ?? ({ status: "not_found" } as FillResult);
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

async function doSuggest(row: Row) {
  state = asking(state, row.key, row.index);
  render();
  const outcome = await bg<SuggestOutcome>({ to: "background", type: "suggest", label: row.label }).catch(
    (): SuggestOutcome => ({ outcome: "unavailable" }),
  );
  state = gotSuggestion(state, row.key, row.index, outcome);
  render();
}

async function draftText(row: Row): Promise<string | null> {
  const choice = row.draft?.choices[0];
  if (!choice) return null;
  return bg<string | null>({ to: "background", type: "draft", documentId: choice.documentId });
}

chrome.tabs.onUpdated.addListener((id, info) => {
  // During a guided run the runner does its own looking; otherwise follow the student's own page changes.
  if (runner && (runner.run.status === "filling" || runner.run.status === "moving")) return;
  if (id === tabId && info.status === "complete" && phaseOf(state) !== "loading" && state.profile) void rescan();
});

// ---------------------------------------------------------------------------------------------- guided apply (A2.2)

let runner: GuidedRunner | null = null;
let pendingLoad: Promise<boolean> | null = null;
let runEnded = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves true when the tab next finishes loading a new page, false after the timeout. Set up before pressing. */
function nextLoad(timeoutMs = 15_000) {
  let resolve!: (v: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  let sawLoading = false;
  const listener = (id: number, info: { status?: string }) => {
    if (id !== tabId) return;
    if (info.status === "loading") sawLoading = true;
    if (info.status === "complete" && sawLoading) finish(true);
  };
  const timer = setTimeout(() => finish(false), timeoutMs);
  function finish(v: boolean) {
    chrome.tabs.onUpdated.removeListener(listener);
    clearTimeout(timer);
    resolve(v);
  }
  chrome.tabs.onUpdated.addListener(listener);
  return { promise, cancel: () => finish(false) };
}

function newRunner(): GuidedRunner {
  return new GuidedRunner({
    scan: async () => {
      // Just after a page change the content script may not be ready yet.
      for (let i = 0; i < 20; i++) {
        const scan = await toPage<ScanResult>({ to: "content", type: "scan" });
        if (scan) {
          state = { ...state, scan, rows: buildRows(scan, state.profile) };
          return { page: scan.page, fields: scan.fields, errors: scan.errors };
        }
        await sleep(250);
      }
      return null;
    },
    plan: (fields, skipped) => {
      const adapter = state.scan ? adapterByPortal(state.scan.portal) : null;
      if (!adapter || !state.profile) return { toFill: [], listed: [], pause: { reason: "unexpected", fields: [] } };
      return planPage(fields, state.profile, adapter, skipped);
    },
    fill: async (f) =>
      (await toPage<FillResult>({ to: "content", type: "fill", key: f.key, ...(f.index ? { index: f.index } : {}), value: f.value, overwrite: false })) ?? {
        status: "not_found",
      },
    press: async (control) => {
      const loaded = nextLoad();
      const res = (await toPage<PressResult>({ to: "content", type: "press", control })) ?? { status: "not_found" };
      if (res.status === "pressed") pendingLoad = loaded.promise;
      else loaded.cancel();
      return res;
    },
    waitForPage: async () => {
      const p = pendingLoad;
      pendingLoad = null;
      return p ? p : false;
    },
    log: (kind, role, page, source, reason) =>
      void bg({ to: "background", type: "log", kind, role: role as Role | null, page, source, reason }).catch(() => {}),
    changed: (r) => {
      const st = r.run.status;
      if (!runEnded && (st === "at_review" || st === "stopped")) {
        runEnded = true;
        void bg({ to: "background", type: "end", outcome: st === "at_review" ? "review" : "stopped" }).catch(() => {});
      }
      render();
    },
  });
}

async function startGuided() {
  if (!state.applicationId || !state.scan) return;
  runner = newRunner();
  runEnded = false;
  runStarted = true;
  await bg({ to: "background", type: "start", applicationId: state.applicationId, portal: state.scan.portal, adapterVersion: state.scan.adapterVersion, feature: "guided" }).catch(() => {});
  render();
  await runner.start();
}

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
      // A guided run can pause on a page the panel can't fill, such as the portal's sign-in screen.
      if (runner && runner.run.status !== "ready") parts.push(...guidedView());
      parts.push(h("p", { id: "unsupported" }, t.unsupported), button(t.checkAgain, rescan));
      break;
    case "ready": {
      // While a guided run has the page, its card is the one place to act; the rows return when the student
      // takes over or the run ends.
      const running = runner && ["filling", "moving", "paused", "at_review"].includes(runner.run.status);
      parts.push(...guidedView(), ...(running ? [] : rowsView()));
      break;
    }
  }
  if (s.notice && !s.notice.key) parts.push(h("p", { role: "status" }, t[s.notice.text]));
  app.replaceChildren(...parts.filter((p): p is Node | string => !!p));
}

function guidedView(): Child[] {
  const scan = state.scan;
  if (!scan?.guided) return [];
  const r = runner?.run;
  const adapter = adapterByPortal(scan.portal);
  if (!r || r.status === "ready") {
    return [
      h(
        "section",
        { id: "guided-start", class: "guided", "aria-labelledby": "guided-title" },
        h("h2", { id: "guided-title" }, t.guidedTitle),
        h("p", {}, t.guidedIntro),
        h("p", {}, h("strong", {}, t.guidedNever)),
        adapter ? h("p", {}, t.guidedSections) : null,
        adapter ? h("ul", {}, ...adapter.map.sections.map((sec) => h("li", {}, sec.title))) : null,
        h("p", {}, state.profile?.aiPolicy === "allows" ? t.guidedEssaysPaste : t.guidedEssaysCopy),
        button(t.startGuided, startGuided, { id: "start-guided" }),
      ),
    ];
  }

  const pageTitle = adapter?.map.pages.find((p) => p.id === r.pageId)?.title ?? "";
  const body: Child[] = [];
  const controls: Child[] = [];
  const g = runner!;
  switch (r.status) {
    case "filling":
      body.push(h("p", { id: "guided-status", role: "status" }, t.guidedFilling(r.page, pageTitle)));
      controls.push(button(t.pauseRun, () => g.pause()), button(t.stopRun, () => g.stop(), { class: "secondary" }));
      break;
    case "moving":
      body.push(h("p", { id: "guided-status", role: "status" }, t.guidedMoving));
      controls.push(button(t.pauseRun, () => g.pause()), button(t.stopRun, () => g.stop(), { class: "secondary" }));
      break;
    case "paused": {
      const p = r.pause!;
      const detailKey = p.detail ? (`guidedDetail_${p.detail}` as MsgKey) : null;
      const text =
        detailKey && detailKey in t
          ? (t[detailKey] as string)
          : p.reason === "student" && !p.fields?.length
            ? t.guidedPausedByYou
            : (t[`guidedPause_${p.reason}` as MsgKey] as string);
      body.push(h("p", { id: "guided-status", role: "alert", "data-reason": p.reason }, text));
      const needing = (p.fields ?? []).map((key) => g.scan?.fields.find((f) => f.key === key)).filter((f) => !!f);
      if (needing.length) {
        body.push(
          h("p", {}, t.guidedNeeds),
          h(
            "ul",
            { class: "needs" },
            ...needing.map((f) => {
              const row = state.rows.find((x) => x.key === f.key && x.index === f.index);
              const skip = r.skipped.includes(f.key)
                ? h("span", { class: "status" }, t.guidedSkipped)
                : button(t.skip, () => (g.skip(f.key), render()), { "aria-label": `${t.skip}: ${f.label}`, class: "secondary" });
              if (row?.group !== "essay") return h("li", {}, f.label, " ", skip);
              // An essay: the student's own final draft, offered as the course's AI policy allows (A2.3).
              const body: Child[] = [];
              const actions: Child[] = [];
              essayOffer(row, f.label, body, actions);
              const done = row.status === "filled" ? t.statusPasted : row.status === "copied" ? t.statusCopied : null;
              return h(
                "li",
                { class: "essay", id: `guided-essay-${f.key}` },
                h("span", { class: "label" }, f.label),
                h("div", { class: "body" }, ...body),
                done ? h("span", { class: "status", role: "status" }, done) : null,
                h("div", { class: "actions" }, ...actions, skip),
              );
            }),
          ),
        );
      }
      controls.push(button(t.resumeRun, () => g.resume()), button(t.takeOver, () => g.takeOver(), { class: "secondary" }), button(t.stopRun, () => g.stop(), { class: "secondary" }));
      break;
    }
    case "handed_back":
      body.push(h("p", { id: "guided-status", role: "status" }, t.guidedHandedBack));
      controls.push(button(t.restartRun, () => g.restart()), button(t.stopRun, () => g.stop(), { class: "secondary" }));
      break;
    case "at_review":
      body.push(h("p", { id: "guided-status", role: "status" }, t.guidedAtReview));
      break;
    case "stopped":
      body.push(h("p", { id: "guided-status", role: "status" }, t.guidedStopped));
      controls.push(button(t.startAgain, startGuided));
      break;
    case "finished":
      body.push(h("p", { id: "guided-status", role: "status" }, t.guidedFinished));
      break;
  }
  return [
    h(
      "section",
      { id: "guided-run", class: "guided", "aria-labelledby": "guided-title", "data-status": r.status },
      h("h2", { id: "guided-title" }, t.guidedTitle),
      ...body,
      controls.length ? h("div", { class: "actions" }, ...controls) : null,
    ),
  ];
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
  if (row.via === "suggested") meta.push(h("span", { class: "badge" }, t.confirmedBadge));
  else if (row.via === "map") meta.push(t.confidenceMap);
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
    essayOffer(row, name, body, actions);
  } else {
    const key = `reason_${row.reason ?? "no_match"}` as MsgKey;
    body.push(h("span", { class: "reason" }, key in t ? (t[key] as string) : t.reason_no_match));
    if (canSuggest(row)) suggestionView(row, name, body, actions);
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

/**
 * The student's own final draft for an essay field, in assisted fill and in a paused guided run (A2.3). Paste
 * only where the course's verified policy allows it, and only when the student presses Paste; otherwise copy,
 * for the student to paste themselves. Nothing here ever writes words of its own.
 */
function essayOffer(row: Row, name: string, body: Child[], actions: Child[]) {
  const choice = row.draft?.choices[0];
  if (!row.draft || !choice) {
    body.push(h("span", { class: "reason" }, t.essayNoDraft));
    return;
  }
  if (!choice.fits && choice.wordCount) {
    const limit = state.scan?.fields.find((f) => f.key === row.key)?.wordLimit ?? 0;
    body.push(h("span", { class: "reason" }, t.essayTooLong(choice.wordCount, limit)));
  }
  if (row.draft.paste && choice.fits) {
    actions.push(
      button(
        t.paste,
        async () => {
          const text = await draftText(row);
          if (text) await doFill(row, false, text);
        },
        { "aria-label": `${t.paste}: ${name}` },
      ),
    );
  } else if (!row.draft.paste) body.push(h("span", { class: "reason" }, t.essayCopyOnly));
  actions.push(
    button(
      t.copyDraft,
      async () => {
        const text = await draftText(row);
        if (text) await doCopy(row, text, "copied_draft");
      },
      { "aria-label": `${t.copyDraft}: ${name}`, class: "secondary" },
    ),
  );
}

/** "Suggest what this asks" for a field with no match, and the student's answer to the suggestion (A1.6). */
function suggestionView(row: Row, name: string, body: Child[], actions: Child[]) {
  const sg = row.suggestion;
  switch (sg?.status) {
    case undefined:
      actions.push(button(t.suggest, () => doSuggest(row), { "aria-label": `${t.suggest}: ${name}` }));
      body.push(h("span", { class: "source" }, t.suggestPrivacy));
      return;
    case "asking":
      body.push(h("span", { class: "notice", role: "status" }, t.asking));
      return;
    case "suggested": {
      const roleName = sg.role ? t.roleNames[sg.role] : "";
      body.push(
        h("span", { class: "suggestion" }, h("span", { class: "badge" }, t.suggestedBadge), " ", t.suggestedAs(roleName)),
        h("span", { class: "source" }, t.suggestConfirm),
      );
      actions.push(
        button(t.useThis, () => ((state = confirmSuggestion(state, row.key, row.index)), render()), { "aria-label": `${t.useThis}: ${name}` }),
        button(t.notRight, () => ((state = rejectSuggestion(state, row.key, row.index)), render()), { "aria-label": `${t.notRight}: ${name}`, class: "secondary" }),
      );
      return;
    }
    case "none":
      body.push(h("span", { class: "notice" }, t.suggestNone));
      return;
    case "limit":
      body.push(h("span", { class: "notice" }, t.suggestLimit));
      return;
    case "unavailable":
      body.push(h("span", { class: "notice" }, t.suggestUnavailable));
      return;
    case "rejected":
      body.push(h("span", { class: "notice" }, t.suggestRejected));
      return;
  }
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
