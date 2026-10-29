import { label } from "@/lib/format";

export type ApplicationEvent = {
  kind: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
};

/** One line of an application's history, in plain words. */
export function describeEvent(e: ApplicationEvent): string {
  switch (e.kind) {
    case "created":
      return "Added to your tracker";
    case "status":
      return e.from_value ? `Moved from ${label(e.from_value)} to ${label(e.to_value)}` : `Moved to ${label(e.to_value)}`;
    case "decision":
      return e.to_value ? `Decision recorded: ${label(e.to_value)}` : "Decision cleared";
    case "portal_check":
      return e.note ? `Checked the portal: ${e.note}` : "Checked the portal";
    case "note":
      return e.note ?? "";
    default:
      return label(e.kind);
  }
}

/** "today", "yesterday" or "N days ago", for when the portal was last checked. */
export function checkedAgo(iso: string | null, now = new Date()): string {
  if (!iso) return "never";
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
