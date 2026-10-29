/** "2027-autumn" → "Autumn 2027". Unknown shapes are shown as given. */
export function intakeLabel(label: string | null | undefined): string {
  const m = /^(\d{4})-([a-z]+)$/.exec(label ?? "");
  return m ? `${m[2]![0]!.toUpperCase()}${m[2]!.slice(1)} ${m[1]}` : (label ?? "");
}

/** A name for the card, typed by the student and never stored: printable characters only, at most 40. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\p{C}<>]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  return name || null;
}

/** What the card says. Course, university and intake only: no grades, scores, funding or ranking. */
export function shareCardLines(input: { title: string; institution: string; intake: string | null; name: string | null }) {
  return {
    headline: input.name ? `${input.name} got in!` : "I got in!",
    course: input.title,
    institution: input.institution,
    intake: intakeLabel(input.intake),
  };
}
