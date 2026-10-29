export const CV_SECTIONS = {
  education: "Education",
  experience: "Experience",
  projects: "Projects",
  awards: "Awards and achievements",
  skills: "Skills",
  other: "Other",
} as const;
export type CvSection = keyof typeof CV_SECTIONS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** "Sep 2022 – Jun 2024", "Sep 2022 – present", or "" with no dates. */
export function dateRange(start: string | null, end: string | null): string {
  if (!start) return end ? month(end) : "";
  return `${month(start)} – ${end ? month(end) : "present"}`;
}

const WEAK_OPENINGS = /^(responsible for|worked on|helped( with)?|involved in|assisted( with)?|participated in|tasked with)\b/i;
const VAGUE = /\b(various|several|etc\.?|many|lots of|a number of)\b/i;

/**
 * Questions about one bullet, never a rewrite. Skills lines are lists, so only the length check applies.
 */
export function bulletHints(bullet: string, section: string): string[] {
  const text = bullet.trim();
  const hints: string[] = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  if (section !== "skills") {
    if (WEAK_OPENINGS.test(text)) hints.push("What did you do yourself? Start with the action you took.");
    if (!/\d/.test(text)) hints.push("Can you add a number: how many, how much, how often, or by how much it changed?");
    if (VAGUE.test(text)) hints.push("Which ones exactly? Name them.");
  }
  if (words > 30) hints.push("Could this be one line? Readers skim.");
  return hints;
}

/** Sections in CV order; within a section, current and recent entries first. */
export function orderEntries<T extends { section: string; start_month: string | null; end_month: string | null }>(entries: T[]) {
  const order = Object.keys(CV_SECTIONS);
  const key = (e: T) => e.end_month ?? (e.start_month ? "9999-12-01" : "0000-01-01");
  return [...entries].sort(
    (a, b) => order.indexOf(a.section) - order.indexOf(b.section) || key(b).localeCompare(key(a)) || (b.start_month ?? "").localeCompare(a.start_month ?? ""),
  );
}
