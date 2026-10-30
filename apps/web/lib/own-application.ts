/**
 * Journey M3 (J3.3): an application's course, whether it's a catalogue course or one the student added
 * themselves. An own application has no cycle; its title, institution and country are the student's own
 * words, shown with an "added by you, not checked" label and never as facts.
 */

interface WithCourse {
  own_title?: string | null;
  own_institution?: string | null;
  program_cycles?: { programs?: { title?: string | null; institutions?: { name?: string | null } | null } | null } | null;
}

/** The course's title and institution, and whether the student added it themselves. */
export function courseOf(app: WithCourse | null | undefined): { title: string; institution: string; own: boolean } {
  if (app?.own_title) return { title: app.own_title, institution: app.own_institution ?? "", own: true };
  const program = app?.program_cycles?.programs;
  return { title: program?.title ?? "Course", institution: program?.institutions?.name ?? "", own: false };
}

/** "Title, Institution", for lists and selects. */
export const courseLabel = (app: WithCourse | null | undefined) => {
  const c = courseOf(app);
  return c.institution ? `${c.title}, ${c.institution}` : c.title;
};

/** An own application's date as the student gave it. Stored as the end of that day in UTC, so shown in UTC. */
export const ownDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
