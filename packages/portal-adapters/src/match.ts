// The rule matcher (spec 5.4): the adapter's map first, then the visible label and its section against our
// synonym lists. It reads the page and never changes it.
import type { Adapter, MappedField, MappedPage, Option } from "./format";
import { isProtected, ROLES, type Action, type Role, type RoleSpec } from "./roles";

export type PageKind = "form" | "security" | "fee" | "declaration" | "review" | "confirmation" | "sign_in" | "dashboard" | "unknown";

export interface PageId {
  kind: PageKind;
  /** The map's page id, for form-like pages. */
  pageId?: string;
  /** False when the path is known but the page no longer looks like the map: pause and ask. */
  matchesMap: boolean;
}

export interface FieldMatch {
  /** The element's id, or the group's name for radio buttons. */
  key: string;
  name: string;
  control: string;
  /** The visible label, trimmed. */
  label: string;
  role: Role | null;
  /** 1-based place in a repeated group. */
  index?: number;
  /** 1 from the map; below 1 from label rules; 0 unmatched. */
  confidence: number;
  via: "map" | "label" | "none";
  action: Action;
  required: boolean;
  visible: boolean;
  options?: Option[];
  wordLimit?: number;
  maxlength?: number;
  /** The control, or the first radio of a group. */
  element: Element;
}

/** A label match at or above this is confident enough to offer without asking. */
export const CONFIDENT = 0.85;
const EXACT = 0.9;
const CONTAINS = 0.7;

// ---------------------------------------------------------------------------------------------- page

export function identifyPage(doc: Document, adapter: Adapter): PageId {
  const map = adapter.map;
  const url = new URL(doc.URL);
  if (url.origin !== map.origin) return { kind: "unknown", matchesMap: false };
  const path = url.pathname;
  const has = (id: string | undefined) => !!id && !!doc.getElementById(id);

  if (path === map.signIn.path) return { kind: "sign_in", matchesMap: !!doc.querySelector('input[type="password"]') };
  if (path === map.review.path) return { kind: "review", matchesMap: has(map.review.marker) };
  if (path === map.confirmation.path) return { kind: "confirmation", matchesMap: has(map.confirmation.marker) };
  const page = map.pages.find((p) => p.path === path);
  if (page) return { kind: page.kind, pageId: page.id, matchesMap: pageLooksMapped(doc, page) };
  if (map.dashboard && path === map.dashboard.path) return { kind: "dashboard", matchesMap: has(map.dashboard.start) || has(map.dashboard.status) };
  return { kind: "unknown", matchesMap: false };
}

/** Every always-shown mapped field is on the page (the first entry of a repeated group stands for the group). */
function pageLooksMapped(doc: Document, page: MappedPage): boolean {
  if (page.fields.length === 0) return true;
  return page.fields
    .filter((f) => !f.showWhen)
    .every((f) => {
      const id = f.find.id ?? f.find.idPattern?.replace("{n}", "1");
      const name = f.find.name ?? f.find.namePattern?.replace("{n}", "1");
      return (id && doc.getElementById(id)) || (name && doc.getElementsByName(name).length > 0);
    });
}

// ---------------------------------------------------------------------------------------------- fields

export function matchPage(doc: Document, adapter: Adapter, opts: { includeHidden?: boolean } = {}): FieldMatch[] {
  const where = identifyPage(doc, adapter);
  const page = where.pageId ? adapter.map.pages.find((p) => p.id === where.pageId) : undefined;
  const context = pageContext(doc);
  const out: FieldMatch[] = [];
  const counts = new Map<Role, number>();
  const radios = new Set<string>();

  for (const el of Array.from(doc.querySelectorAll("input, select, textarea"))) {
    const type = controlType(el);
    if (!type) continue;
    const name = el.getAttribute("name") ?? "";
    if (type === "radio") {
      if (radios.has(name)) continue;
      radios.add(name);
    }
    const visible = isShown(el);
    const base = {
      key: type === "radio" ? name || el.id : el.id || name,
      name,
      control: type,
      label: labelOf(el, type),
      required: isRequired(el, type),
      visible,
      element: el,
      ...choices(el, type),
      ...limits(el),
    };

    // A password field, and anything on the sign-in page, is never touched (rule 1).
    if (type === "password" || where.kind === "sign_in") {
      out.push({ ...base, role: null, confidence: 0, via: "none", action: "never" });
      continue;
    }

    const mapped = page && fromMap(page, el, type, name);
    if (mapped) {
      const { field, index } = mapped;
      out.push({
        ...base,
        role: field.role as Role,
        ...(index ? { index } : {}),
        confidence: 1,
        via: "map",
        action: field.action,
        ...(field.wordLimit ? { wordLimit: field.wordLimit } : {}),
      });
      continue;
    }

    const hit = byLabel(base.label, `${base.label} ${groupLegend(el, type)} ${context}`);
    if (!hit) {
      out.push({ ...base, role: null, confidence: 0, via: "none", action: "student" });
      continue;
    }
    const spec: RoleSpec = ROLES[hit.role];
    let index: number | undefined;
    if (spec.repeated) {
      index = (counts.get(hit.role) ?? 0) + 1;
      counts.set(hit.role, index);
    }
    out.push({ ...base, role: hit.role, ...(index ? { index } : {}), confidence: hit.confidence, via: "label", action: spec.action });
  }
  return opts.includeHidden ? out : out.filter((m) => m.visible);
}

function fromMap(page: MappedPage, el: Element, type: string, name: string): { field: MappedField; index?: number } | undefined {
  for (const field of page.fields) {
    const f = field.find;
    if (type === "radio" ? f.name === name : (f.id && f.id === el.id) || (!f.id && f.name && f.name === name)) return { field };
    const pattern = f.idPattern ?? f.namePattern;
    if (pattern) {
      const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\{n\\}", "(\\d+)")}$`);
      const m = re.exec(f.idPattern ? el.id : name);
      if (m) return { field, index: Number(m[1]) };
    }
  }
  return undefined;
}

/** Our synonym lists. Never and pause roles win any tie, so a doubtful label is never treated as fillable. */
function byLabel(label: string, context: string): { role: Role; confidence: number } | null {
  const l = norm(label);
  if (!l) return null;
  const ctx = context.toLowerCase();
  const hits: { role: Role; confidence: number }[] = [];
  for (const [role, spec] of Object.entries(ROLES) as [Role, RoleSpec][]) {
    if (spec.context && !spec.context.some((w) => ctx.includes(w))) continue;
    let best = 0;
    for (const syn of spec.synonyms) {
      if (l === syn) best = Math.max(best, EXACT);
      else if (new RegExp(`(^|[^a-z0-9])${escape(syn)}($|[^a-z0-9])`).test(l)) best = Math.max(best, CONTAINS);
    }
    if (best) hits.push({ role, confidence: best });
  }
  const guarded = hits.filter((h) => isProtected(h.role));
  const pool = guarded.length ? guarded : hits;
  const top = Math.max(0, ...pool.map((h) => h.confidence));
  const winners = pool.filter((h) => h.confidence === top);
  // Two different fillable roles equally likely: the rules don't guess.
  if (winners.length !== 1) return guarded.length && winners[0] ? winners[0] : null;
  return winners[0]!;
}

// ---------------------------------------------------------------------------------------------- reading the DOM

const SKIP = new Set(["hidden", "submit", "button", "reset", "image", "file"]);

export function controlType(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "select" || tag === "textarea") return tag;
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  return SKIP.has(type) ? null : type;
}

export function isShown(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute("hidden") || n.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(n);
    if (style && (style.display === "none" || (n === el && style.visibility === "hidden"))) return false;
  }
  return true;
}

function isRequired(el: Element, type: string): boolean {
  if (type === "radio") {
    const group = sameGroup(el);
    return group.some((r) => r.hasAttribute("required") || r.getAttribute("aria-required") === "true");
  }
  return el.hasAttribute("required") || el.getAttribute("aria-required") === "true";
}

function sameGroup(el: Element): Element[] {
  const name = el.getAttribute("name");
  const scope = el.closest("form") ?? el.ownerDocument;
  return name ? Array.from(scope.querySelectorAll(`input[type="radio"][name="${CSS_escape(name)}"]`)) : [el];
}

export function labelOf(el: Element, type: string): string {
  const doc = el.ownerDocument;
  if (type === "radio") {
    const fs = el.closest("fieldset");
    const legend = fs?.querySelector("legend");
    if (legend) return text(legend);
    const group = el.closest('[role="radiogroup"]');
    if (group) return ariaName(group) ?? "";
  }
  const aria = ariaName(el);
  if (aria) return aria;
  if (el.id) {
    const lab = doc.querySelector(`label[for="${CSS_escape(el.id)}"]`);
    if (lab) return text(lab);
  }
  const wrap = el.closest("label");
  return wrap ? text(wrap) : "";
}

function ariaName(el: Element): string | null {
  const ids = el.getAttribute("aria-labelledby");
  if (ids) {
    const t = ids
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id))
      .filter((x): x is HTMLElement => !!x)
      .map(text)
      .join(" ")
      .trim();
    if (t) return t;
  }
  const label = el.getAttribute("aria-label")?.trim();
  return label || null;
}

/** An element's text without the text of any controls inside it (a select's options, say). */
export function text(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll("input, select, textarea, script, style, [hidden]").forEach((c) => c.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

function choices(el: Element, type: string): { options?: Option[] } {
  if (type === "select") {
    const options = Array.from(el.querySelectorAll("option"))
      .map((o) => ({ value: o.getAttribute("value") ?? text(o), text: text(o) }))
      .filter((o) => o.value !== "");
    return { options };
  }
  if (type === "radio") {
    return {
      options: sameGroup(el).map((r) => ({
        value: r.getAttribute("value") ?? "on",
        text: (r.id && r.ownerDocument.querySelector(`label[for="${CSS_escape(r.id)}"]`) ? text(r.ownerDocument.querySelector(`label[for="${CSS_escape(r.id)}"]`)!) : text(r.closest("label") ?? r)) || "",
      })),
    };
  }
  return {};
}

function limits(el: Element): { wordLimit?: number; maxlength?: number } {
  const out: { wordLimit?: number; maxlength?: number } = {};
  const words = Number(el.getAttribute("data-word-limit"));
  if (words > 0) out.wordLimit = words;
  const max = Number(el.getAttribute("maxlength"));
  if (max > 0) out.maxlength = max;
  return out;
}

/** A repeated group's legend ("Activity 2") or similar container wording, for context. */
function groupLegend(el: Element, type: string): string {
  if (type === "radio") return "";
  const legend = el.closest("fieldset")?.querySelector("legend");
  return legend ? text(legend) : "";
}

/** Words around the page that tell us what a section is about: its heading, current step and title. */
function pageContext(doc: Document): string {
  const parts = [doc.title, ...Array.from(doc.querySelectorAll("h1, h2, [aria-current]")).map(text)];
  return parts.join(" ");
}

function norm(label: string): string {
  return label
    .toLowerCase()
    .replace(/\((optional|required)\)/g, " ")
    .replace(/[?:*!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function CSS_escape(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
