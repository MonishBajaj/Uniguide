/** The label on a course the student added themselves (J3.3): their own words, never checked facts. */
export function OwnBadge({ text }: { text: string }) {
  return <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">{text}</span>;
}
