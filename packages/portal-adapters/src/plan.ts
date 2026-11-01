// Planning one page of a guided-apply run (plan A2.2, spec 6.2 steps 2 to 4): what to fill, what to list for the
// student, and whether to pause once the confident fields are filled. Pure: the content script describes the
// page's fields, including whether each already holds something; this decides.
import type { Adapter } from "./format";
import { CONFIDENT, type FieldMatch } from "./match";
import type { FillProfile } from "./profile";
import { resolveValue } from "./resolve";
import { ROLES, type Role, type RoleSpec } from "./roles";
import type { PauseReason } from "./run";

/** A field as the content script reports it: the match without its element, and whether it has a value yet. */
export type PlanField = Omit<FieldMatch, "element"> & { hasValue: boolean };

export interface PlannedFill {
  key: string;
  index?: number;
  value: string;
  role: Role;
  source: string;
}

export interface ListedField {
  key: string;
  label: string;
  role: Role | null;
  /** Why it's left: a pause reason, or that it already had something in it, or that the student skipped it. */
  reason: PauseReason | "already_filled" | "skipped" | "essay";
}

export interface PagePlan {
  toFill: PlannedFill[];
  listed: ListedField[];
  pause: { reason: PauseReason; fields: string[] } | null;
}

/** Gravest first: anything that signs, pays or proves you're human, then what can't be matched, then what's missing. */
const PRIORITY: PauseReason[] = ["captcha", "declaration", "payment", "fee_waiver", "sign_in", "no_match", "format_differs", "no_value", "student"];

export function planPage(fields: PlanField[], profile: FillProfile, adapter: Adapter, skipped: string[]): PagePlan {
  const toFill: PlannedFill[] = [];
  const listed: ListedField[] = [];
  const pausing: { key: string; reason: PauseReason }[] = [];
  const list = (f: PlanField, reason: ListedField["reason"]) => listed.push({ key: f.key, label: f.label, role: f.role, reason });
  /** A field the run can't fill: listed, and a reason to pause if the portal needs it and it's still empty. */
  const leave = (f: PlanField, reason: PauseReason) => {
    list(f, reason);
    if (f.required && !f.hasValue) pausing.push({ key: f.key, reason });
  };

  for (const f of fields) {
    if (!f.visible) continue;
    if (skipped.includes(f.key)) {
      list(f, "skipped");
      continue;
    }
    // Only what the map knows, or a label match the rules are sure of, is ever filled without the student.
    const confident = f.role !== null && (f.via === "map" || f.confidence >= CONFIDENT);
    const r = resolveValue(f, profile, adapter);

    if (r.status === "never" || r.status === "pause") {
      // Something that signs, pays or checks you're human: always the student's, required or not.
      const reason: PauseReason = r.status === "pause" ? "captcha" : r.reason === "sign_in" ? "sign_in" : r.reason;
      list(f, reason);
      pausing.push({ key: f.key, reason });
      continue;
    }
    if (!confident) {
      leave(f, "no_match");
      continue;
    }
    // An essay is the student's own writing, never filled by the run. It pauses for one that's empty when the
    // portal needs it, or when there's a final draft to offer (pasted only if the student says so, A2.3).
    if ((ROLES[f.role!] as RoleSpec).draftKinds) {
      list(f, "essay");
      if (!f.hasValue && (f.required || r.status === "draft")) pausing.push({ key: f.key, reason: "student" });
      continue;
    }
    switch (r.status) {
      case "value":
        if (f.hasValue) list(f, "already_filled");
        else toFill.push({ key: f.key, ...(f.index ? { index: f.index } : {}), value: r.value, role: f.role!, source: r.source });
        break;
      case "draft":
        break; // essays are handled above
      case "needs_student":
        leave(f, r.reason);
        break;
    }
  }

  const top = PRIORITY.find((p) => pausing.some((x) => x.reason === p));
  return { toFill, listed, pause: top ? { reason: top, fields: pausing.map((x) => x.key) } : null };
}
