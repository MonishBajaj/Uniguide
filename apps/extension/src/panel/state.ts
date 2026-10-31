// The side panel's state, kept pure so it can be tested without a browser (spec 5.3).
import { resolveValue, type DraftChoice, type FieldMatch, type FillProfile, type Role } from "@uniguide/portal-adapters";
import { adapterByPortal } from "../adapters";
import type { AccountState, EventKind, FieldView, FillResult, ScanResult, ToBackground } from "../messages";
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
  via: FieldView["via"];
  group: Group;
  /** What Fill writes: the stored value, or the portal option that means the same. */
  value?: string;
  /** How the value shows on the portal: an option's text, else the value itself. */
  shown?: string;
  source?: string;
  reason?: string;
  draft?: { paste: boolean; choices: DraftChoice[] };
  status: RowStatus;
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
  return scan.fields.map((f) => {
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
  });
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
