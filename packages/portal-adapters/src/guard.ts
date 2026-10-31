// The guard (spec 7.2): every click, key, fill and navigation the content script makes goes through it. It
// denies by default. An adapter can only narrow what it allows: every check after "the adapter declares it"
// is made from the page itself, so a wrong adapter can't get a final, paying or declaring control pressed.
import type { Adapter } from "./format";
import { controlType, identifyPage, isShown, labelOf, text, type FieldMatch } from "./match";
import { isProtected } from "./roles";

export interface GuardContext {
  /** The top-level portal page the run is on. */
  doc: Document;
  adapter: Adapter;
  /** Active: not paused or stopped. The student started it. */
  run: { active: boolean; startedByStudent: boolean };
}

export type GuardBlock =
  | "run_inactive"
  | "frame"
  | "disabled"
  | "not_a_control"
  | "checkbox"
  | "never_click"
  | "page_differs"
  | "not_a_step"
  | "not_declared"
  | "off_origin"
  | "words"
  | "submit_unsafe"
  | "enter"
  | "activation"
  | "password"
  | "hidden"
  | "protected_field";

export type GuardDecision = { allow: true } | { allow: false; why: GuardBlock; detail: string };

const OK: GuardDecision = { allow: true };
const no = (why: GuardBlock, detail: string): GuardDecision => ({ allow: false, why, detail });

// ---------------------------------------------------------------------------------------------- word lists

/**
 * Words that mark a final, paying, signing or declaring control (spec 7.2, rule 4), matched as whole words,
 * case-insensitive, on the control's text, value, accessible name, title and labels. The spec's list plus a
 * few stricter additions (withdraw, delete, cancel, accept, finish, checkout).
 */
export const GUARD_WORDS_EN = [
  "submit", "submits", "submitted", "submitting", "submission",
  "pay", "pays", "paying", "payment", "payments", "purchase", "buy", "checkout", "check out",
  "fee", "fees", "waiver", "waive",
  "sign", "signs", "signed", "signing", "signature", "e-sign", "esign",
  "certify", "certifies", "certified", "certification",
  "declare", "declares", "declared", "declaration",
  "confirm", "confirms", "confirmed", "confirmation",
  "agree", "agreed", "i agree", "accept",
  "final", "finalise", "finalize", "finish",
  "send application", "send my application",
  "withdraw", "delete", "cancel",
];

/** The same in Hindi, matched as substrings. */
export const GUARD_WORDS_HI = [
  "सबमिट", "जमा", "भुगतान", "शुल्क", "फीस", "छूट", "हस्ताक्षर", "प्रमाणित", "प्रमाणन", "घोषणा", "घोषित",
  "पुष्टि", "सहमत", "स्वीकार", "अंतिम", "आवेदन भेजें", "खरीद", "वापस लें", "रद्द",
];

/** In a URL's path or query, these words mark a final, paying or declaring destination. */
const URL_WORDS = new Set([
  "submit", "submission", "pay", "payment", "payments", "checkout", "purchase", "fee", "fees", "waiver", "sign",
  "signature", "esign", "certify", "certification", "declare", "declaration", "confirm", "confirmation", "final",
  "finalise", "finalize", "withdraw", "delete", "cancel", "agree", "accept",
]);

/** A field labelled with any of these makes its form a final step: payment, signature, declaration or a security check. */
const FINAL_FIELD_WORDS = [
  "pay", "payment", "fee", "fees", "waiver", "sign", "signature", "declare", "declaration", "certify", "certification",
  "captcha", "not a robot", "security check", "type the word", "verification code", "card number", "cvv", "cvc",
  "भुगतान", "शुल्क", "हस्ताक्षर", "घोषणा", "प्रमाणित",
];

function hasWord(s: string, latin: readonly string[], hindi: readonly string[] = []): string | null {
  const t = s.toLowerCase().replace(/\s+/g, " ");
  for (const w of latin) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(t)) return w;
  }
  for (const w of hindi) if (t.includes(w)) return w;
  return null;
}

function urlWord(url: URL): string | null {
  const tokens = `${url.pathname} ${url.search}`.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.find((t) => URL_WORDS.has(t)) ?? null;
}

// ---------------------------------------------------------------------------------------------- reading a control

/** Everything a control says about itself: text, value, accessible name, title, alt and labels. */
function wordsOn(el: Element): string {
  const doc = el.ownerDocument;
  const parts = [text(el), el.getAttribute("value") ?? "", el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? "", el.getAttribute("alt") ?? ""];
  for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) {
    const l = doc.getElementById(id);
    if (l) parts.push(text(l));
  }
  if (el.id) doc.querySelectorAll(`label[for="${el.id.replace(/["\\]/g, "\\$&")}"]`).forEach((l) => parts.push(text(l)));
  const wrap = el.closest("label");
  if (wrap) parts.push(text(wrap));
  return parts.join(" ");
}

/** Where pressing the control would go: a link's href, or a submit button's form action. */
function destination(el: Element, form: HTMLFormElement | null): URL | null {
  const base = el.ownerDocument.URL;
  const href = el.tagName === "A" ? el.getAttribute("href") : null;
  const target = href ?? (form ? (el.getAttribute("formaction") ?? form.getAttribute("action") ?? base) : null);
  if (target === null) return null;
  try {
    return new URL(target, base);
  } catch {
    return null;
  }
}

function formOf(el: Element): HTMLFormElement | null {
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "INPUT") return (el as HTMLButtonElement | HTMLInputElement).form;
  return null;
}

function isSubmit(el: Element): boolean {
  if (el.tagName === "BUTTON") return (el.getAttribute("type") ?? "submit").toLowerCase() === "submit" && !!formOf(el);
  if (el.tagName === "INPUT") return ["submit", "image"].includes((el.getAttribute("type") ?? "").toLowerCase()) && !!formOf(el);
  return false;
}

function inOtherDocument(el: Element, ctx: GuardContext): boolean {
  if (el.getRootNode() !== ctx.doc) return true; // another frame, or a shadow root we didn't map
  const view = ctx.doc.defaultView;
  return !!view && view.top !== view; // the run itself is inside a frame
}

/**
 * A form a next-page button may send: it has questions on it, and none of them is a password, a payment, a
 * signature, a declaration or a security check. A form with nothing to fill is a final step.
 */
function unsafeForm(form: HTMLFormElement, button: Element): string | null {
  const fields = Array.from(form.querySelectorAll("input, select, textarea")).filter((f) => f !== button);
  let fillable = 0;
  for (const f of fields) {
    const type = controlType(f);
    if (!type) {
      // Hidden inputs can carry the intent too (action=submit).
      if (hasWord(`${f.getAttribute("name") ?? ""} ${f.getAttribute("value") ?? ""}`, ["submit", "final", "pay", "payment", "sign", "declare", "confirm"]))
        return "a hidden field marks this form final";
      continue;
    }
    if (type === "password") return "the form has a password field";
    const label = labelOf(f, type);
    if ((type === "checkbox" || type === "radio") && hasWord(label, GUARD_WORDS_EN, GUARD_WORDS_HI)) return `the form has a "${label}" choice`;
    const w = hasWord(label, FINAL_FIELD_WORDS);
    if (w) return `the form asks "${label}"`;
    if (isShown(f)) fillable++;
  }
  return fillable === 0 ? "the form has nothing to fill, so sending it is a final step" : null;
}

// ---------------------------------------------------------------------------------------------- the checks

function allowClick(control: Element, ctx: GuardContext): GuardDecision {
  if (!ctx.run.active || !ctx.run.startedByStudent) return no("run_inactive", "the run isn't active");
  if (inOtherDocument(control, ctx)) return no("frame", "the control is in another frame");
  if (control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") return no("disabled", "the control is disabled");
  const type = control.tagName === "INPUT" ? (control.getAttribute("type") ?? "text").toLowerCase() : null;
  if (type === "checkbox" || type === "radio") return no("checkbox", "the guard never ticks or chooses");
  if (control.tagName === "SELECT" || control.tagName === "TEXTAREA" || (type && !["submit", "button", "image"].includes(type))) {
    return no("not_a_control", "this is a field, not a button or link");
  }

  const map = ctx.adapter.map;
  const id = control.id;
  if (id && map.neverClick.some((n) => n.id === id)) return no("never_click", `${id} is on the never-click list`);

  const where = identifyPage(ctx.doc, ctx.adapter);
  if (!where.matchesMap) return no("page_differs", "the page doesn't match the map");
  if (where.kind !== "form" && where.kind !== "dashboard") return no("not_a_step", `no clicks on a ${where.kind} page`);

  const page = where.pageId ? map.pages.find((p) => p.id === where.pageId) : undefined;
  const declaredHere = page ? [...Object.values(page.controls), page.group?.add].includes(id) : id === map.dashboard?.start;
  if (!id || !declaredHere || !map.allowedClicks.some((c) => c.id === id)) return no("not_declared", "the adapter doesn't declare this control");

  const form = formOf(control);
  const dest = destination(control, form);
  if (dest && dest.origin !== new URL(map.origin).origin) return no("off_origin", `it goes to ${dest.origin}`);
  const said = hasWord(wordsOn(control), GUARD_WORDS_EN, GUARD_WORDS_HI);
  if (said) return no("words", `the control says "${said}"`);
  const path = dest && urlWord(dest);
  if (path) return no("words", `it goes to a "${path}" address`);

  if (isSubmit(control) && form) {
    const why = unsafeForm(form, control);
    if (why) return no("submit_unsafe", why);
  }
  return OK;
}

const TEXT_TYPES = new Set(["text", "email", "tel", "number", "date", "month", "week", "time", "url", "search", "datetime-local"]);

function allowKey(key: string, target: Element, ctx: GuardContext): GuardDecision {
  if (!ctx.run.active || !ctx.run.startedByStudent) return no("run_inactive", "the run isn't active");
  if (inOtherDocument(target, ctx)) return no("frame", "the field is in another frame");
  if (key === "Enter") return no("enter", "Enter can send a form");
  const type = controlType(target);
  if (type === "password") return no("password", "we never type into a password field");
  if (key === " " || key === "Spacebar") {
    if (type !== "textarea" && !TEXT_TYPES.has(type ?? "")) return no("activation", "Space presses buttons and ticks boxes");
  }
  if (type !== "textarea" && !TEXT_TYPES.has(type ?? "")) return no("not_a_control", "keys go only to text fields");
  return OK;
}

function allowFill(m: FieldMatch, ctx: GuardContext): GuardDecision {
  if (!ctx.run.active || !ctx.run.startedByStudent) return no("run_inactive", "the run isn't active");
  const el = m.element;
  if (inOtherDocument(el, ctx)) return no("frame", "the field is in another frame");
  const type = controlType(el);
  if (type === "password") return no("password", "we never fill a password");
  const label = type ? labelOf(el, type) : m.label;
  if ((type === "checkbox" || type === "radio") && hasWord(label, GUARD_WORDS_EN, GUARD_WORDS_HI)) {
    return no("checkbox", `never ticks "${label}"`);
  }
  if (hasWord(label, FINAL_FIELD_WORDS)) return no("protected_field", `"${label}" is a payment, signature, declaration or security field`);
  const where = identifyPage(ctx.doc, ctx.adapter);
  if (where.kind === "sign_in" || where.kind === "unknown") return no("not_a_step", `no fills on a ${where.kind} page`);
  if (!m.visible || !isShown(el)) return no("hidden", "the field isn't visible");
  if (!m.role) return no("not_a_control", "the field has no role");
  if (m.action !== "fill" && m.action !== "confirm") return no("protected_field", `${m.role} is ${m.action}`);
  if (isProtected(m.role)) return no("protected_field", `${m.role} is never filled`);
  return OK;
}

function allowNavigate(url: string, ctx: GuardContext): GuardDecision {
  if (!ctx.run.active || !ctx.run.startedByStudent) return no("run_inactive", "the run isn't active");
  let dest: URL;
  try {
    dest = new URL(url, ctx.doc.URL);
  } catch {
    return no("off_origin", "not a valid address");
  }
  if (dest.origin !== new URL(ctx.adapter.map.origin).origin) return no("off_origin", `it goes to ${dest.origin}`);
  const w = urlWord(dest);
  if (w) return no("words", `it goes to a "${w}" address`);
  return OK;
}

/** The reason to log in `assist_events` for a blocked action. */
export function guardLogReason(d: GuardDecision): "page_differs" | "guard" | null {
  if (d.allow) return null;
  return d.why === "page_differs" ? "page_differs" : "guard";
}

export const guard = { allowClick, allowKey, allowFill, allowNavigate };
