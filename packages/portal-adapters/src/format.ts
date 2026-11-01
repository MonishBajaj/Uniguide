// The adapter format: a portal's map (our own structured data, recorded per spec 7.3 and 7.4) plus what the
// matcher needs to read it, and a validator that every adapter must pass.
import { isProtected, isRole, ROLES, type Action } from "./roles";

export interface Option {
  value: string;
  text: string;
}

export interface MappedField {
  role: string;
  label: string;
  control: string;
  required: boolean;
  /** How to find the field: an exact id and name, or a pattern with `{n}` for repeated groups. */
  find: { id?: string; name?: string; optionIds?: Record<string, string>; idPattern?: string; namePattern?: string };
  options?: Option[];
  showWhen?: { field: string; equals: string };
  wordLimit?: number;
  maxlength?: number;
  hint?: string;
  source: string | null;
  action: Action;
  note?: string;
}

export interface MappedPage {
  id: string;
  path: string;
  kind: "form" | "security" | "fee" | "declaration";
  title: string;
  section: string | null;
  fields: MappedField[];
  group?: { name: string; min: number; max: number; containerIdPattern: string; add: string };
  controls: { continue?: string; save?: string; back?: string };
}

export interface PortalMap {
  portal: string;
  mapVersion: string;
  recordedOn: string;
  howRecorded: string;
  origin: string;
  signIn: { path: string; by: "student"; note: string };
  dashboard?: { path: string; start?: string; status?: string };
  sections: { title: string }[];
  pages: MappedPage[];
  review: { path: string; marker: string; stop: true; note?: string };
  confirmation: { path: string; marker: string; reference?: string; note?: string };
  errors?: { marker: string; note?: string };
  conditionalAttribute?: { field: string; equals: string; hiddenBy: string };
  neverClick: { id: string; page: string; kind: string; what: string }[];
  allowedClicks: { id: string; what: string }[];
}

export interface Adapter {
  /** Matches `assist_runs.portal`. */
  portal: string;
  /** Matches `assist_runs.adapter_version`. */
  version: string;
  map: PortalMap;
  /**
   * For choice fields: which of the portal's options means the same as each of our codes, per role.
   * This names the same thing in the portal's words. It never converts a value; a code with no entry means
   * the portal doesn't offer it, and the student decides.
   */
  optionEquivalents: Partial<Record<string, Record<string, string>>>;
  /** Guided apply is supported on this portal (its terms allow it; plan section 3.4). */
  guided?: boolean;
}

/** Problems with an adapter, as plain sentences. Empty means it's usable. */
export function validateAdapter(a: Adapter): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const page of a.map.pages) {
    for (const f of page.fields) {
      if (!isRole(f.role)) {
        problems.push(`${page.id}: unknown role ${f.role}`);
        continue;
      }
      const key = f.find.id ?? f.find.idPattern ?? f.find.name ?? f.find.namePattern;
      if (!key) problems.push(`${page.id}: ${f.role} has no way to find it`);
      else if (seen.has(key)) problems.push(`${key} is mapped twice`);
      else seen.add(key);
      if (isProtected(f.role) && f.action !== ROLES[f.role].action) {
        problems.push(`${page.id}: ${f.role} must be ${ROLES[f.role].action}, not ${f.action}`);
      }
    }
  }
  const never = new Set(a.map.neverClick.map((n) => n.id));
  for (const c of a.map.allowedClicks) if (never.has(c.id)) problems.push(`${c.id} is both allowed and never-click`);
  for (const [role, table] of Object.entries(a.optionEquivalents)) {
    const options = new Set(a.map.pages.flatMap((p) => p.fields.filter((f) => f.role === role).flatMap((f) => f.options ?? []).map((o) => o.value)));
    for (const [ours, theirs] of Object.entries(table ?? {})) {
      if (!options.has(theirs)) problems.push(`${role}: ${ours} maps to ${theirs}, which isn't an option`);
    }
  }
  return problems;
}
