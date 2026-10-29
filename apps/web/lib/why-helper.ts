/**
 * "Why this university" helper: specific, checkable material about one course, taken from stored
 * facts and OpenAlex, and a check of which of it the student's own draft names. It never suggests
 * wording; it shows facts and asks questions.
 */
export type MaterialItem = { key: string; group: "Researchers" | "Place" | "Course"; label: string; detail: string; terms: string[] };

type Course = { city: string | null; duration_months: number | null; delivery_mode: string | null; languages_of_instruction: string[] | null; track: string | null };
type Faculty = { id: string; name: string; topics: { name: string }[]; recent_works: { title: string; year: number }[] };

const DELIVERY: Record<string, string> = { on_campus: "on campus", online: "online", hybrid: "partly online" };
const LANGUAGE: Record<string, string> = { en: "English", de: "German", nl: "Dutch", fr: "French" };

/** The surname is what a reader would recognise in a draft. */
const surname = (name: string) => name.trim().split(/\s+/).pop() ?? name;

export function courseMaterial(course: Course, faculty: Faculty[]): MaterialItem[] {
  const items: MaterialItem[] = [];
  for (const f of faculty) {
    items.push({
      key: `faculty:${f.id}`,
      group: "Researchers",
      label: f.name,
      detail: [f.topics.slice(0, 3).map((t) => t.name).join(", "), f.recent_works[0] ? `recent: "${f.recent_works[0].title}" (${f.recent_works[0].year})` : ""]
        .filter(Boolean)
        .join("; "),
      terms: surname(f.name).length >= 3 ? [surname(f.name)] : [f.name],
    });
  }
  if (course.city) {
    items.push({ key: "place", group: "Place", label: course.city, detail: "Where you would live and study", terms: [course.city] });
  }
  const format = [
    course.duration_months ? `${course.duration_months} months` : "",
    course.delivery_mode ? (DELIVERY[course.delivery_mode] ?? course.delivery_mode) : "",
    course.languages_of_instruction?.length ? `taught in ${course.languages_of_instruction.map((l) => LANGUAGE[l] ?? l).join(" and ")}` : "",
    course.track ? `${course.track} track` : "",
  ].filter(Boolean);
  if (format.length) {
    // Format is context, not a specific reason, so it is never counted as "named".
    items.push({ key: "format", group: "Course", label: "Format", detail: format.join(", "), terms: [] });
  }
  return items;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Keys of the items whose terms appear in the draft as whole words, ignoring case. */
export function namedInDraft(draft: string, items: MaterialItem[]): Set<string> {
  const found = new Set<string>();
  for (const item of items) {
    if (item.terms.some((t) => new RegExp(`(^|[^\\p{L}])${escape(t)}($|[^\\p{L}])`, "iu").test(draft))) found.add(item.key);
  }
  return found;
}

export const WHY_QUESTIONS: Record<MaterialItem["group"], string> = {
  Researchers: "Whose recent paper asks a question close to yours, and what have you done that connects to it?",
  Place: "What would you do there that you could not do elsewhere? Leave it out if the honest answer is nothing.",
  Course: "Which part of the format suits how you learn or what you need next?",
};
