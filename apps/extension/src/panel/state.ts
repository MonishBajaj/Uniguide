// The side panel's state, kept pure so it can be tested without a browser (spec 5.3).
import { resolveValue, ROLES, type Adapter, type DraftChoice, type FieldMatch, type FillProfile, type Role } from "@uniguide/portal-adapters";
import { adapterByPortal } from "../adapters";
import type { AccountState, EventKind, FieldView, FillResult, ScanResult, SuggestOutcome, ToBackground } from "../messages";
import type { MsgKey } from "./i18n";

/**
 * - fill: a confirmed fact, with Fill, Copy and Skip
 * - essay: the student's own final draft, pasted only where allowed
 * - review: no match or no confirmed value; the student fills it
 * - yours: sign, pay, declare or a security check; the student's own step, no actions
 */
export type Group = "fill" | "essay" | "review" | "yours";

export type RowStatus = "ready" | "filled" | "copied" | "skipped" | "blocked" | "no_option" | "too_long";

export interface Row {
  key: string;
  index?: number;
  role: Role | null;
  label: string;
  required: boolean;
  confidence: number;
  /** "suggested": the student confirmed a suggested role for a field the rules couldn't match (A1.6). */
  via: FieldView["via"] | "suggested";
  group: Group;
  /** What Fill writes: the stored value, or the portal option that means the same. */
  value?: string;
  /** How the value shows on the portal: an option's text, else the value itself. */
  shown?: string;
  source?: string;
  reason?: string;
  draft?: { paste: boolean; choices: DraftChoice[] };
  status: RowStatus;
  suggestion?: { status: "asking" | "suggested" | "none" | "limit" | "unavailable" | "rejected"; role?: Role };
  /** The role the student confirmed; sent with the fill, so the page writer can check it again. */
  confirmedRole?: Role;
}

export type Phase = "loading" | "signed_out" | "consent" | "choose" | "unsupported" | "ready";

export interface PanelState {
  account?: AccountState;
  applicationId?: string;
  profile?: FillProfile | null;
  /** null: the content script isn't on this page, or the page isn't one the adapter knows. */
  scan?: ScanResult | null;
  rows: Row[];
  prompt?: { key: string; index?: number; current: string; value: string };
  notice?: { key?: string; text: MsgKey };
}

export const initial = (): PanelState => ({ rows: [] });

export function phaseOf(s: PanelState): Phase {
  if (!s.account) return "loading";
  if (!s.account.signedIn) return "signed_out";
  if (s.account.consent !== "not_required" && s.account.consent !== "granted") return "consent";
  if (!s.applicationId || !s.profile) return "choose";
  if (s.scan === undefined) return "loading";
  if (!s.scan || s.scan.page.kind === "unknown" || s.scan.page.kind === "sign_in") return "unsupported";
  return "ready";
}

export function buildRows(scan: ScanResult | null | undefined, profile: FillProfile | null | undefined): Row[] {
  if (!scan || !profile) return [];
  const adapter = adapterByPortal(scan.portal);
  if (!adapter) return [];
  return scan.fields.map((f) => rowFor(f, profile, adapter));
}

function rowFor(f: FieldView, profile: FillProfile, adapter: Adapter): Row {
  // The resolver only reads the field's description, never the element.
  const r = resolveValue(f as FieldMatch, profile, adapter);
  const row: Row = {
    key: f.key,
    ...(f.index ? { index: f.index } : {}),
    role: f.role,
    label: f.label,
    required: f.required,
    confidence: f.confidence,
    via: f.via,
    group: "review",
    status: "ready",
  };
  switch (r.status) {
    case "value":
      return { ...row, group: "fill", value: r.value, shown: f.options?.find((o) => o.value === r.value)?.text ?? r.value, source: r.source };
    case "draft":
      return { ...row, group: "essay", draft: { paste: r.paste, choices: r.choices }, source: r.source };
    case "needs_student":
      return { ...row, group: f.role && (f.role as string).startsWith("essay.") ? "essay" : "review", reason: r.reason };
    case "pause":
    case "never":
      return { ...row, group: "yours", reason: r.reason };
  }
}

// ---------------------------------------------------------------------------------------------- suggestions (A1.6)

/** Only a field the rules couldn't match can be suggested, and only before the student has confirmed one. */
export const canSuggest = (r: Row) =>
  r.group === "review" && r.reason === "no_match" && r.via === "none" && !r.confirmedRole && r.label.trim() !== "";

/** A row can be filled only with a value, and a suggested role only once the student has confirmed it. */
export const canFill = (r: Row) => r.group === "fill" && r.value !== undefined && (r.via !== "suggested" || r.confirmedRole !== undefined);

const withSuggestion = (s: PanelState, key: string, index: number | undefined, suggestion: Row["suggestion"]): PanelState => ({
  ...s,
  rows: s.rows.map((r) => (same(r, key, index) ? { ...r, suggestion } : r)),
});

export const asking = (s: PanelState, key: string, index?: number) => withSuggestion(s, key, index, { status: "asking" });

export function gotSuggestion(s: PanelState, key: string, index: number | undefined, o: SuggestOutcome): PanelState {
  return withSuggestion(s, key, index, o.outcome === "role" ? { status: "suggested", role: o.role } : { status: o.outcome });
}

export const rejectSuggestion = (s: PanelState, key: string, index?: number) => withSuggestion(s, key, index, { status: "rejected" });

/** The student says the suggestion is right: the row is worked out again as if the rules had found that role. */
export function confirmSuggestion(s: PanelState, key: string, index?: number): PanelState {
  const row = s.rows.find((r) => same(r, key, index));
  const role = row?.suggestion?.status === "suggested" ? row.suggestion.role : undefined;
  const field = s.scan?.fields.find((f) => f.key === key && (index === undefined || f.index === index));
  const adapter = s.scan ? adapterByPortal(s.scan.portal) : null;
  if (!row || !role || !field || !adapter || !s.profile) return s;
  const next: Row = {
    ...rowFor({ ...field, role, action: ROLES[role].action }, s.profile, adapter),
    via: "suggested",
    confirmedRole: role,
    suggestion: { status: "suggested", role },
  };
  return { ...s, rows: s.rows.map((r) => (same(r, key, index) ? next : r)) };
}

const same = (r: Row, key: string, index?: number) => r.key === key && (index === undefined || r.index === index);
const mark = (s: PanelState, key: string, index: number | undefined, status: RowStatus): PanelState => ({
  ...s,
  rows: s.rows.map((r) => (same(r, key, index) ? { ...r, status } : r)),
});

export function applyFill(s: PanelState, key: string, index: number | undefined, result: FillResult): PanelState {
  const row = s.rows.find((r) => same(r, key, index));
  const { prompt: _p, notice: _n, ...rest } = s;
  switch (result.status) {
    case "filled":
      return mark(rest, key, index, "filled");
    case "confirm_overwrite":
      return { ...rest, prompt: { key, ...(index ? { index } : {}), current: result.current, value: row?.value ?? "" } };
    case "no_option":
      return { ...mark(rest, key, index, "no_option"), notice: { key, text: "noOption" } };
    case "too_long":
      return { ...mark(rest, key, index, "too_long"), notice: { key, text: "tooLong" } };
    case "not_found":
      return { ...rest, notice: { key, text: "notFound" } };
    case "blocked":
      return { ...mark(rest, key, index, "blocked"), notice: { key, text: "blocked" } };
  }
}

export const copied = (s: PanelState, key: string, index?: number) => mark(s, key, index, "copied");
export const skipped = (s: PanelState, key: string, index?: number) => mark(s, key, index, "skipped");
export const dismissPrompt = (s: PanelState): PanelState => {
  const { prompt: _p, ...rest } = s;
  return rest;
};

/** The audit event for an action on a row: its role, page and source, never its value. */
export function logFor(s: PanelState, row: Row, kind: EventKind, reason: string | null = null): ToBackground {
  const why = reason ?? (kind === "skipped" || kind === "left" ? (row.reason === "student" || !row.reason ? "student" : row.reason) : null);
  return {
    to: "background",
    type: "log",
    kind,
    role: row.role,
    page: s.scan?.page.pageId ?? s.scan?.page.kind ?? null,
    source: kind === "skipped" || kind === "left" ? null : (row.source ?? null),
    reason: why,
  };
}

/** Plain words for where a value came from. */
export function sourceKey(source: string): MsgKey {
  if (source === "contact.email") return "srcEmail";
  if (source === "contact.residenceCountry") return "srcCountry";
  if (source === "education.qualification") return "srcQualification";
  if (source === "education.grade.scale") return "srcScale";
  if (source.startsWith("education.grade")) return "srcGrade";
  if (source.startsWith("testScores")) return "srcTests";
  if (source.startsWith("activities")) return "srcCv";
  if (source === "finalDraft") return "srcDraft";
  return "srcProfile";
}
