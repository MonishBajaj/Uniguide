/**
 * 10.1 Pre-departure checklist. The generic steps below are practical, not legal: anything that
 * depends on the country (visas, APS, proof of funds) comes only from published country_rules,
 * with the official link. Due dates count back from the course start.
 */

export interface CountryRule {
  id: string;
  kind: string;
  title: string;
  details: string | null;
  link: string | null;
  status: string;
}

export interface DepartureTask {
  key: string;
  title: string;
  body: string;
  weeksBefore: number;
  /** YYYY-MM-DD, or null when the start date is unknown. */
  due: string | null;
  link?: string | null;
  status?: string;
}

const GENERIC: Omit<DepartureTask, "due">[] = [
  { key: "accommodation", weeksBefore: 12, title: "Arrange somewhere to live", body: "University housing often opens early and fills fast. Check the university's housing page before private listings, and never pay a deposit for a place you have not verified." },
  { key: "insurance", weeksBefore: 8, title: "Arrange health insurance", body: "Check what cover your visa and your university require, and whether a student or public scheme applies to you." },
  { key: "flights", weeksBefore: 8, title: "Book your travel", body: "Aim to arrive before orientation. Check the university's arrival dates and any airport pickup it offers." },
  { key: "money", weeksBefore: 4, title: "Plan money for the first weeks", body: "Rent deposits and setup costs come before your first month settles. Have a card that works abroad and know how you will open a local account." },
  { key: "documents", weeksBefore: 2, title: "Put together the documents to carry", body: "Passport, visa, offer letter, original transcripts and certificates, proof of funds and insurance. Keep copies separate from the originals." },
  { key: "phone", weeksBefore: 1, title: "Plan a phone and data for arrival", body: "Check your phone works abroad, or how you will get a local SIM, so you can reach your accommodation and the university on day one." },
  { key: "arrival", weeksBefore: -1, title: "Register after you arrive", body: "Many countries and universities ask you to register your address, enrol in person or report to the international office within days. Your university's arrival guide lists what applies." },
];

const RULE_WEEKS: Record<string, number> = { aps_certificate: 24, proof_of_funds: 16, visa_info: 12 };

/** Typical start month and day per intake term, used only when the cycle has no start date. */
const TERM_STARTS: Record<string, string> = {
  fall: "09-01",
  autumn: "09-01",
  september: "09-01",
  winter: "10-01",
  spring: "01-15",
  january: "01-15",
  summer: "04-01",
  may: "05-01",
  semester_1: "02-15",
  semester_2: "07-15",
};

/** The course start: the published date, or an approximate one from the intake term. */
export function courseStart(cycle: { starts_on: string | null; intake_year: number; intake_term: string }): { date: string; approximate: boolean } | null {
  if (cycle.starts_on) return { date: cycle.starts_on, approximate: false };
  const monthDay = TERM_STARTS[cycle.intake_term];
  return monthDay ? { date: `${cycle.intake_year}-${monthDay}`, approximate: true } : null;
}

function weeksBefore(start: string, weeks: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Generic steps plus the destination's rules, earliest first. */
export function departureTimeline(rules: CountryRule[], start: string | null): DepartureTask[] {
  const fromRules = rules.map((r) => ({
    key: `rule:${r.id}`,
    title: r.title,
    body: r.details ?? "Read the official page for what applies to you and how long it takes.",
    weeksBefore: RULE_WEEKS[r.kind] ?? 12,
    link: r.link,
    status: r.status,
  }));
  return [...fromRules, ...GENERIC]
    .map((t) => ({ ...t, due: start ? weeksBefore(start, t.weeksBefore) : null }))
    .sort((a, b) => b.weeksBefore - a.weeksBefore);
}

/** Tasks grouped by the month they are due in (YYYY-MM), in order. Undated tasks share one group. */
export function groupByMonth(tasks: DepartureTask[]): { month: string | null; tasks: DepartureTask[] }[] {
  const groups: { month: string | null; tasks: DepartureTask[] }[] = [];
  for (const t of tasks) {
    const month = t.due?.slice(0, 7) ?? null;
    const last = groups.at(-1);
    if (last && last.month === month) last.tasks.push(t);
    else groups.push({ month, tasks: [t] });
  }
  return groups;
}

export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
