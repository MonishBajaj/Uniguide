/**
 * Age from a birth month only. Assumes the birthday is the last day of that month, which errs
 * towards the younger age (the safe side for consent). Mirrors public.age_in_years in SQL.
 */
export function ageFromBirthMonth(birthMonth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(birthMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const birthday = new Date(Date.UTC(year, month, 0)); // last day of the birth month
  let age = today.getUTCFullYear() - birthday.getUTCFullYear();
  const before =
    today.getUTCMonth() < birthday.getUTCMonth() ||
    (today.getUTCMonth() === birthday.getUTCMonth() && today.getUTCDate() < birthday.getUTCDate());
  if (before) age -= 1;
  return age;
}

/** Only redirect to paths on this site. */
export function safeNext(next: unknown, fallback = "/app"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
