// The value resolver: from `fill_profile` to the value for one matched field, exactly as stored, with its
// source. It never converts. When the portal wants a format or option the student hasn't entered, the
// answer is "needs the student".
import type { Adapter } from "./format";
import type { FieldMatch } from "./match";
import type { FillProfile } from "./profile";
import { ROLES, type Role, type RoleSpec } from "./roles";

export interface DraftChoice {
  documentId: string;
  versionId: string;
  wordCount: number | null;
  /** False when the draft is over the field's word limit. It's never trimmed. */
  fits: boolean;
}

/** `reason` values are those `log_assist_event` accepts. */
export type Resolution =
  | { status: "value"; value: string; source: string }
  | { status: "draft"; paste: boolean; choices: DraftChoice[]; source: "finalDraft" }
  | { status: "needs_student"; reason: "no_value" | "format_differs" | "student" | "no_match" }
  | { status: "pause"; reason: "captcha" }
  | { status: "never"; reason: "declaration" | "fee_waiver" | "payment" | "sign_in" };

const ENGLISH_EXAMS = new Set(["ielts_academic", "ielts_ukvi", "toefl_ibt", "toefl_ibt_home", "pte_academic", "duolingo", "cambridge_c1_c2"]);
/** Roles whose value is one of our codes; they can only go into a field with matching options. */
const CODED = new Set<Role>(["education.qualification", "education.grade.scale", "tests.english.exam", "contact.residence_country", "tests.english.taken"]);

export function resolveValue(
  m: Omit<FieldMatch, "element">,
  p: FillProfile,
  adapter: Adapter,
  opts: { activityOrder?: string[] } = {},
): Resolution {
  if (!m.role) return m.action === "never" ? { status: "never", reason: "sign_in" } : { status: "needs_student", reason: "no_match" };
  const role = m.role;
  if (m.action === "never") return { status: "never", reason: role.startsWith("fee.") ? "fee_waiver" : role.startsWith("declaration.") ? "declaration" : "payment" };
  if (m.action === "pause") return { status: "pause", reason: "captcha" };
  if (m.action === "student") return { status: "needs_student", reason: "student" };

  if ((ROLES[role] as RoleSpec).draftKinds) return draft(m, p, ROLES[role] as RoleSpec);

  const raw = rawValue(role, m, p, opts.activityOrder);
  if (!raw) return { status: "needs_student", reason: "no_value" };
  if (!CODED.has(role)) return { status: "value", ...raw };

  // A code: only the portal's option that means the same thing, and only if it's really there.
  if (!m.options) return { status: "needs_student", reason: "format_differs" };
  const table = adapter.optionEquivalents[role];
  const option = table ? table[raw.value] : raw.value;
  if (!option || !m.options.some((o) => o.value === option)) return { status: "needs_student", reason: "format_differs" };
  return { status: "value", value: option, source: raw.source };
}

function rawValue(role: Role, m: Omit<FieldMatch, "element">, p: FillProfile, order?: string[]): { value: string; source: string } | null {
  const val = (value: unknown, source: string) => (value === null || value === undefined || value === "" ? null : { value: String(value), source });
  const english = p.testScores.map((t, i) => ({ t, i })).filter(({ t }) => ENGLISH_EXAMS.has(t.exam));
  const latest = english[0];
  switch (role) {
    case "contact.email":
      return val(p.contact.email, "contact.email");
    case "contact.residence_country":
      return val(p.contact.residenceCountry, "contact.residenceCountry");
    case "education.qualification":
      return val(p.education.qualification, "education.qualification");
    case "education.grade.scale":
      return val(p.education.grade.scale, "education.grade.scale");
    case "education.grade.value":
      // As entered: the number if there is one, otherwise the text. Never converted.
      return val(p.education.grade.value, "education.grade.value") ?? val(p.education.grade.text, "education.grade.text");
    case "tests.english.taken":
      // "yes" only when we know of a test; we never answer "no" for the student.
      return latest ? { value: "yes", source: `testScores[${latest.i}]` } : null;
    case "tests.english.exam":
      return latest ? val(latest.t.exam, `testScores[${latest.i}].exam`) : null;
    case "tests.english.total":
      return latest ? val(latest.t.total, `testScores[${latest.i}].total`) : null;
    case "tests.english.taken_on":
      return latest ? val(latest.t.takenOn, `testScores[${latest.i}].takenOn`) : null;
    case "activities[].role":
    case "activities[].organisation": {
      const list = order ? order.map((id) => p.activities.findIndex((a) => a.id === id)).filter((i) => i >= 0) : p.activities.map((_, i) => i);
      const at = list[(m.index ?? 1) - 1];
      if (at === undefined) return null;
      const a = p.activities[at]!;
      return role === "activities[].role" ? val(a.title, `activities[${at}].title`) : val(a.organisation, `activities[${at}].organisation`);
    }
    default:
      return null;
  }
}

/** The student's own final draft only. Automatic paste only where the verified policy allows it (rule 7). */
function draft(m: Omit<FieldMatch, "element">, p: FillProfile, spec: RoleSpec): Resolution {
  const kinds = new Set(spec.draftKinds);
  const choices = p.finalDrafts
    .filter((d) => kinds.has(d.kind))
    .map((d) => ({
      documentId: d.documentId,
      versionId: d.versionId,
      wordCount: d.wordCount,
      fits: !m.wordLimit || (d.wordCount ?? Infinity) <= m.wordLimit,
    }));
  if (choices.length === 0) return { status: "needs_student", reason: "no_value" };
  return { status: "draft", paste: p.aiPolicy === "allows", choices, source: "finalDraft" };
}
