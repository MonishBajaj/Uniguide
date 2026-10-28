export type CalendarDeadline = {
  id: string;
  applicantCategory: string;
  round: string | null;
  programSlug: string;
  programTitle: string;
  institution: string;
  country: string;
  level: string;
  kind: string;
  dueAt: string;
  timezone: string;
  precision: string;
  status: string;
};

export type CalendarMonth = { month: string; label: string; items: CalendarDeadline[] };

/** The year and month a deadline falls in, in the institution's own time zone. */
function monthKey(dueAt: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(new Date(dueAt));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}`;
}

/** Upcoming deadlines grouped by month (ascending), each month's items by due time. */
export function groupByMonth(rows: CalendarDeadline[], now: Date): CalendarMonth[] {
  const months = new Map<string, CalendarDeadline[]>();
  for (const row of rows) {
    if (new Date(row.dueAt) < now) continue;
    const key = monthKey(row.dueAt, row.timezone);
    months.set(key, [...(months.get(key) ?? []), row]);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      month,
      label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)),
      items: items.sort((x, y) => x.dueAt.localeCompare(y.dueAt)),
    }));
}
