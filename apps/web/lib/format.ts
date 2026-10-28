export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/** A deadline as the institution states it: in its own time zone, at the precision it gives. */
export function deadlineText(dueAt: string, timezone: string, precision: string): string {
  const date = new Date(dueAt);
  if (precision === "month") {
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: timezone }).format(date);
  }
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(date);
  if (precision !== "exact_time") return day;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(date);
  return `${day}, ${time}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function daysUntil(iso: string, now = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

const LABELS: Record<string, string> = {
  continued_interest: "Letter of continued interest",
  foundation: "Foundation",
  diploma: "Diploma",
  bachelor: "Bachelor's",
  master: "Master's",
  doctorate: "Doctorate",
  on_campus: "On campus",
  online: "Online",
  hybrid: "Hybrid",
  ielts_academic: "IELTS Academic",
  ielts_ukvi: "IELTS UKVI",
  toefl_ibt: "TOEFL iBT",
  toefl_ibt_home: "TOEFL iBT Home",
  pte_academic: "PTE Academic",
  duolingo: "Duolingo English Test",
  cambridge_c1_c2: "Cambridge C1/C2",
  testdaf: "TestDaF",
  dsh: "DSH",
  goethe: "Goethe",
  delf_dalf: "DELF/DALF",
  tcf: "TCF",
  gre: "GRE",
  gmat: "GMAT",
  sat: "SAT",
  act: "ACT",
  per_credit: "per credit",
  per_term: "per term",
  per_year: "per year",
  per_month: "per month",
  total: "total",
  one_off: "one time",
  application_fee: "Application fee",
  uni_assist: "uni-assist",
  common_app: "Common App",
};

export const label = (value: string | null | undefined): string =>
  value ? (LABELS[value] ?? value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())) : "";

export const COUNTRIES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  IE: "Ireland",
  NL: "Netherlands",
  FR: "France",
  NZ: "New Zealand",
  IN: "India",
  SG: "Singapore",
  JP: "Japan",
  KR: "South Korea",
  AE: "United Arab Emirates",
  QA: "Qatar",
};

export const countryName = (code: string | null) => (code ? (COUNTRIES[code] ?? code) : "");

export const LEVELS = ["foundation", "diploma", "bachelor", "master", "doctorate"] as const;
export const WAVE_1 = ["US", "GB", "CA", "AU", "DE", "IE"] as const;
export const WAVE_2 = ["NL", "FR", "NZ"] as const;
export const WAVE_3 = ["SG", "JP", "KR", "AE", "QA"] as const;
/** Destinations a student can target, in rollout order. Coverage is deepest in Wave 1. */
export const DESTINATIONS = [...WAVE_1, ...WAVE_2, ...WAVE_3] as const;

export const isFuture = (iso: string, now = new Date()) => Date.parse(iso) > now.getTime();
