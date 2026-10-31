// The background worker: the UniGuide session, the current run and the audit log (spec 7.1).
import { WEB_ORIGIN } from "./config";
import type { AccountState, Application, BackgroundReply, ConsentState, SuggestOutcome, ToBackground } from "./messages";
import { ROLES } from "@uniguide/portal-adapters";
import { acceptSession, getSession, invoke, rest, rpc, SignedOut, signOut } from "./supabase";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Our sign-in page hands over a session made for the extension alone. Only that page, on our own origin.
chrome.runtime.onMessageExternal.addListener((msg: unknown, sender, respond) => {
  const m = msg as { type?: unknown; access_token?: unknown; refresh_token?: unknown } | null;
  if (sender.origin !== WEB_ORIGIN || m?.type !== "uniguide.session" || typeof m.access_token !== "string" || typeof m.refresh_token !== "string") {
    respond({ ok: false });
    return;
  }
  acceptSession({ access_token: m.access_token, refresh_token: m.refresh_token }).then(
    () => respond({ ok: true }),
    () => respond({ ok: false }),
  );
  return true;
});

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

async function endRun(outcome: "stopped" | "abandoned") {
  const id = await getRun();
  if (!id) return;
  await setRun(null);
  await rpc("end_assist_run", { p_run_id: id, p_outcome: outcome }).catch(() => {});
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
          p_feature: "fill",
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
  const roles = Object.keys(ROLES);
  const { status, data } = await invoke<{ role?: string | null }>("suggest-field-role", { label, roles });
  if (status === 429) return { outcome: "limit" };
  if (status !== 200 || !data) return { outcome: "unavailable" };
  const role = data.role;
  return typeof role === "string" && roles.includes(role) ? { outcome: "role", role: role as keyof typeof ROLES } : { outcome: "none" };
}
