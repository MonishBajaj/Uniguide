// Messages between the side panel, the background worker and the content script. Values never travel to the
// background for logging: events carry the field's role, never what was filled.
import type { Action, FillProfile, PageId, Role } from "@uniguide/portal-adapters";

export interface Application {
  id: string;
  title: string;
  institution: string | null;
  status: string;
}

export type ConsentState = "not_required" | "granted" | "pending_parental" | "revoked" | "unknown";

export interface AccountState {
  signedIn: boolean;
  email: string | null;
  consent: ConsentState;
  applications: Application[];
}

export type EventKind =
  | "filled"
  | "copied"
  | "skipped"
  | "left"
  | "blocked"
  | "pasted_draft"
  | "copied_draft"
  | "paused"
  | "resumed"
  | "navigated"
  | "took_over";

/** Panel → background. */
export type ToBackground =
  | { to: "background"; type: "state" }
  | { to: "background"; type: "profile"; applicationId: string }
  | { to: "background"; type: "draft"; documentId: string }
  | { to: "background"; type: "start"; applicationId: string; portal: string; adapterVersion: string; feature: "fill" | "guided" }
  | { to: "background"; type: "log"; kind: EventKind; role: Role | null; page: string | null; source: string | null; reason: string | null }
  | { to: "background"; type: "end"; outcome: "review" | "stopped" | "paused" | "abandoned" }
  | { to: "background"; type: "suggest"; label: string }
  | { to: "background"; type: "takeApply" }
  | { to: "background"; type: "reachedReview" }
  | { to: "background"; type: "submitted"; applicationId: string; how: "confirmation_page" | "student_said_submitted" }
  | { to: "background"; type: "signOut" }
  | { to: "background"; type: "connect" };

export type BackgroundReply<T = unknown> = { ok: true; data: T } | { ok: false; error: "signed_out" | "failed"; detail?: string };

/** A matched field as the panel sees it: everything but the element. */
export interface FieldView {
  key: string;
  name: string;
  control: string;
  label: string;
  role: Role | null;
  index?: number;
  confidence: number;
  via: "map" | "label" | "none";
  action: Action;
  required: boolean;
  visible: boolean;
  options?: { value: string; text: string }[];
  wordLimit?: number;
  maxlength?: number;
  /** Whether the field already holds something (a value, a chosen option, a tick). */
  hasValue: boolean;
}

export interface ScanResult {
  portal: string;
  adapterVersion: string;
  page: PageId;
  fields: FieldView[];
  /** The portal is showing its error summary. */
  errors: boolean;
  /** The adapter supports guided apply. */
  guided: boolean;
}

/** What the single writer did. */
export type FillResult =
  | { status: "filled" }
  | { status: "confirm_overwrite"; current: string }
  | { status: "no_option" }
  | { status: "too_long" }
  | { status: "not_found" }
  | { status: "blocked"; why: string; logReason: "guard" | "page_differs" };

export type GoResult = { status: "going" } | { status: "blocked"; why: string } | { status: "not_found" };

/** Panel → content script. */
export type ToContent =
  | { to: "content"; type: "scan" }
  | { to: "content"; type: "fill"; key: string; index?: number; value: string; overwrite: boolean; confirmedRole?: Role }
  | { to: "content"; type: "press"; control: "continue" | "start" }
  | { to: "content"; type: "go"; path: string };

/** An Apply from the tracker, waiting for the panel to pick it up (A2.4). */
export interface PendingApply {
  applicationId: string;
  portal: string;
}

export type PressResult = { status: "pressed" } | { status: "blocked"; why: string } | { status: "not_found" };

/** What the suggest-field-role function said about one unmatched field (A1.6). */
export type SuggestOutcome = { outcome: "role"; role: Role } | { outcome: "none" | "limit" | "unavailable" };

export type { FillProfile };
