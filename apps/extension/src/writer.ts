// The single writer: the only code that changes a portal page. It writes one field at a time, as a student
// would, and only after the guard allows it. It never clicks, never submits, never navigates and never sends
// a key. It asks before replacing what's already there, picks only an exactly matching option, and never
// truncates.
import { guard, guardLogReason, isRole, matchPage, ROLES, type Adapter, type FieldMatch, type Role } from "@uniguide/portal-adapters";
import type { FillResult } from "./messages";

export interface FillRequest {
  key: string;
  index?: number;
  value: string;
  overwrite: boolean;
  /** For a field the rules couldn't match: the role the student confirmed from a suggestion (A1.6). */
  confirmedRole?: Role;
}

export function fill(doc: Document, adapter: Adapter, req: FillRequest): FillResult {
  let m = matchPage(doc, adapter).find((x) => x.key === req.key && (req.index === undefined || x.index === req.index));
  if (!m) return { status: "not_found" };
  if (req.confirmedRole !== undefined) {
    // Only for a field with no match: a confirmed suggestion never replaces what the rules found.
    if (m.role !== null || m.via !== "none" || !isRole(req.confirmedRole)) return { status: "blocked", why: "confirmed_role", logReason: "guard" };
    m = { ...m, role: req.confirmedRole, action: ROLES[req.confirmedRole].action };
  }
  // The student pressed Fill for this one field: that starts this action (rule 2).
  const decision = guard.allowFill(m, { doc, adapter, run: { active: true, startedByStudent: true } });
  if (!decision.allow) return { status: "blocked", why: decision.why, logReason: guardLogReason(decision) ?? "guard" };

  switch (m.control) {
    case "select":
      return fillSelect(m.element as HTMLSelectElement, req);
    case "radio":
      return fillRadio(m, req);
    case "checkbox":
      // No role the extension fills is a checkbox; ticking is the student's to do.
      return { status: "blocked", why: "checkbox", logReason: "guard" };
    default:
      return fillText(m.element as HTMLInputElement | HTMLTextAreaElement, req);
  }
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, req: FillRequest): FillResult {
  const max = el.maxLength;
  if (max > 0 && req.value.length > max) return { status: "too_long" };
  const current = el.value;
  if (current === req.value) return { status: "filled" };
  if (current.trim() !== "" && !req.overwrite) return { status: "confirm_overwrite", current };
  setValue(el, req.value);
  announce(el);
  return { status: "filled" };
}

function fillSelect(el: HTMLSelectElement, req: FillRequest): FillResult {
  const option = Array.from(el.options).find((o) => o.value === req.value);
  if (!option) return { status: "no_option" };
  if (el.value === req.value) return { status: "filled" };
  if (el.value !== "" && !req.overwrite) return { status: "confirm_overwrite", current: el.selectedOptions[0]?.text ?? el.value };
  setValue(el, req.value);
  announce(el);
  return { status: "filled" };
}

function fillRadio(m: FieldMatch, req: FillRequest): FillResult {
  const scope = m.element.closest("form") ?? m.element.ownerDocument;
  const group = Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)).filter((r) => r.name === m.name);
  const target = group.find((r) => r.value === req.value);
  if (!target) return { status: "no_option" };
  if (target.checked) return { status: "filled" };
  const chosen = group.find((r) => r.checked);
  if (chosen && !req.overwrite) return { status: "confirm_overwrite", current: chosen.value };
  target.checked = true;
  announce(target);
  return { status: "filled" };
}

/** Set a value the way the page's own scripts expect, through the element's own setter. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/** Tell the page its field changed, as typing would: input and change events only. */
function announce(el: Element) {
  const view = el.ownerDocument.defaultView;
  const Ev = view?.Event ?? Event;
  el.dispatchEvent(new Ev("input", { bubbles: true }));
  el.dispatchEvent(new Ev("change", { bubbles: true }));
}
