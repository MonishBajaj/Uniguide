const DAY = 86_400_000;

/**
 * Freshness rules from the plan: in application season a deadline nobody has re-checked for 30
 * days, or a fee quoted for an earlier fee year than the intake, gets a "check again" warning.
 */
export function deadlineIsStale(fact: { verified_at: string | null; status: string; due_at: string }, now = new Date()): boolean {
  if (new Date(fact.due_at) < now) return false;
  if (fact.status !== "verified" || !fact.verified_at) return false;
  return now.getTime() - new Date(fact.verified_at).getTime() > 30 * DAY;
}

/** "2026-27", "2026/27", "2026", "WiSe 2026/27" -> 2026. */
export function feeStartYear(feeYear: string | null): number | null {
  const match = feeYear?.match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

export function feeIsStale(fact: { fee_year: string | null }, intakeYear: number): boolean {
  const year = feeStartYear(fact.fee_year);
  return year != null && year < intakeYear;
}
