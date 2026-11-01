// The background worker: the UniGuide session, the current run and the audit log (spec 7.1).
import { WEB_ORIGIN } from "./config";
import { adapterServing, guidedSystems } from "./adapters";
import type { AccountState, Application, BackgroundReply, ConsentState, PendingApply, SuggestOutcome, ToBackground } from "./messages";
import { ROLES } from "@uniguide/portal-adapters";
import { suggestionFrom } from "./suggest";
import { acceptSession, getSession, invoke, rest, rpc, SignedOut, signOut } from "./supabase";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Our own web app only (externally_connectable): it hands over a session made for the extension alone, asks
// whether the extension is ready for guided apply, and starts an Apply from the tracker (A2.4).
chrome.runtime.onMessageExternal.addListener((msg: unknown, sender, respond) => {
  const m = msg as { type?: unknown; access_token?: unknown; refresh_token?: unknown; applicationId?: unknown; system?: unknown } | null;
  if (sender.origin !== WEB_ORIGIN || !m) {
    respond({ ok: false });
    return;
  }
  if (m.type === "uniguide.session" && typeof m.access_token === "string" && typeof m.refresh_token === "string") {
    acceptSession({ access_token: m.access_token, refresh_token: m.refresh_token }).then(
      () => respond({ ok: true }),
      () => respond({ ok: false }),
    );
    return true;
  }
  if (m.type === "uniguide.status") {
    getSession().then((s) => respond({ ok: true, installed: true, signedIn: !!s, guided: guidedSystems() }));
    return true;
  }
  if (m.type === "uniguide.apply" && typeof m.applicationId === "string" && typeof m.system === "string") {
    applyFromTracker(m.applicationId, m.system).then(respond, () => respond({ ok: false }));
    return true;
  }
  respond({ ok: false });
});

const APPLY_KEY = "uniguide.apply";
const REVIEW_KEY = "uniguide.runAtReview";

/** Open the portal for this application and leave the run for the panel to start. The student presses Start. */
async function applyFromTracker(applicationId: string, system: string) {
  const adapter = adapterServing(system);
  if (!adapter) return { ok: false, reason: "unsupported" };
  if (!(await getSession())) return { ok: false, reason: "signed_out" };
  await chrome.storage.session.set({ [APPLY_KEY]: { applicationId, portal: adapter.portal } satisfies PendingApply });
  const tab = await chrome.tabs.create({ url: new URL(adapter.map.dashboard?.path ?? adapter.map.signIn.path, adapter.map.origin).href });
  // Opening the panel needs a gesture Chrome may not pass on from a web page; if not, the student opens it.
  if (tab.id !== undefined) await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  return { ok: true };
}

/** One of the extension's own pages (the panel), not a content script running on a portal page. */
const fromOwnPage = (sender: chrome.runtime.MessageSender | undefined) =>
  sender?.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(""));

// The panel's requests. Content scripts can't use any of these.
chrome.runtime.onMessage.addListener((msg: ToBackground, sender, respond) => {
  if (!fromOwnPage(sender) || msg?.to !== "background") return;
  handle(msg).then(
    (data) => respond({ ok: true, data } satisfies BackgroundReply),
    (e: unknown) => respond({ ok: false, error: e instanceof SignedOut ? "signed_out" : "failed", detail: String((e as Error)?.message ?? e) } satisfies BackgroundReply),
  );
  return true;
});

// The current run's id. Kept in session storage: the worker can be stopped while the panel stays open.
const RUN_KEY = "uniguide.run";
async function getRun(): Promise<string | null> {
  return ((await chrome.storage.session.get(RUN_KEY))[RUN_KEY] as string | undefined) ?? null;
}
async function setRun(id: string | null): Promise<void> {
  if (id) await chrome.storage.session.set({ [RUN_KEY]: id });
  else await chrome.storage.session.remove(RUN_KEY);
}

// The run ends when the panel closes, even if it couldn't say so.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel" || !fromOwnPage(port.sender)) return;
  port.onDisconnect.addListener(() => void endRun("abandoned"));
});

async function endRun(outcome: "review" | "stopped" | "paused" | "abandoned") {
  const id = await getRun();
  if (!id) return;
  // A guided run that reached the review page and then the panel closed ended at review, not abandoned.
  const atReview = ((await chrome.storage.session.get(REVIEW_KEY))[REVIEW_KEY] as boolean | undefined) ?? false;
  await setRun(null);
  await chrome.storage.session.remove(REVIEW_KEY);
  await rpc("end_assist_run", { p_run_id: id, p_outcome: outcome === "abandoned" && atReview ? "review" : outcome }).catch(() => {});
}

interface AppRow {
  id: string;
  status: string;
  own_title: string | null;
  own_institution: string | null;
  program_cycles: { programs: { title: string; institutions: { name: string } | null } | null } | null;
}

async function state(): Promise<AccountState> {
  const s = await getSession();
  if (!s) return { signedIn: false, email: null, consent: "unknown", applications: [] };
  const [profile] = await rest<{ consent_state: ConsentState }[]>("profiles?select=consent_state");
  const consent = profile?.consent_state ?? "unknown";
  if (consent !== "not_required" && consent !== "granted") return { signedIn: true, email: s.user.email, consent, applications: [] };
  const rows = await rest<AppRow[]>(
    "applications?select=id,status,own_title,own_institution,program_cycles(programs(title,institutions(name)))&order=created_at.desc",
  );
  const applications: Application[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    title: r.program_cycles?.programs?.title ?? r.own_title ?? "Application",
    institution: r.program_cycles?.programs?.institutions?.name ?? r.own_institution,
  }));
  return { signedIn: true, email: s.user.email, consent, applications };
}

async function handle(msg: ToBackground): Promise<unknown> {
  switch (msg.type) {
    case "state":
      return state();
    case "profile":
      return rpc("fill_profile", { p_application_id: msg.applicationId });
    case "draft":
      return rpc("final_draft_text", { p_document_id: msg.documentId });
    case "start":
      await endRun("stopped");
      {
        const id = await rpc<string>("start_assist_run", {
          p_application_id: msg.applicationId,
          p_portal: msg.portal,
          p_feature: msg.feature,
          p_adapter_version: msg.adapterVersion,
        });
        await setRun(id);
        return id;
      }
    case "log": {
      const id = await getRun();
      if (!id) return null;
      return rpc("log_assist_event", {
        p_run_id: id,
        p_kind: msg.kind,
        p_field_role: msg.role,
        p_page: msg.page,
        p_source: msg.source,
        p_reason: msg.reason,
      });
    }
    case "end":
      return endRun(msg.outcome);
    case "suggest":
      return suggest(msg.label);
    case "takeApply": {
      const pending = ((await chrome.storage.session.get(APPLY_KEY))[APPLY_KEY] as PendingApply | undefined) ?? null;
      await chrome.storage.session.remove(APPLY_KEY);
      return pending;
    }
    case "reachedReview":
      return chrome.storage.session.set({ [REVIEW_KEY]: true });
    case "submitted": {
      // The run stays open at review so the submission can be logged on it; mark_application_submitted ends it.
      const id = await getRun();
      await rpc("mark_application_submitted", { p_application_id: msg.applicationId, p_how: msg.how, p_run_id: id });
      await setRun(null);
      await chrome.storage.session.remove(REVIEW_KEY);
      return null;
    }
    case "signOut":
      await endRun("stopped");
      return signOut();
    case "connect":
      return chrome.tabs.create({ url: `${WEB_ORIGIN}/extension/connect` });
  }
}

/**
 * A suggested role for one unmatched field (A1.6). Only the field's visible label and our role list are sent:
 * the function refuses anything else. The answer is a suggestion; the student confirms it in the panel.
 */
async function suggest(label: string): Promise<SuggestOutcome> {
  const { status, data } = await invoke<unknown>("suggest-field-role", { label, roles: Object.keys(ROLES) });
  return suggestionFrom(status, data);
}
