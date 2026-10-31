/**
 * Start years a student can pick: this year to five years ahead (journey M2, S1.03). A year saved
 * earlier stays in the list, so editing the profile never silently drops it.
 */
export function intakeYears(thisYear: number, saved: number | null = null): number[] {
  const years = Array.from({ length: 6 }, (_, i) => thisYear + i);
  return saved != null && !years.includes(saved) ? [saved, ...years] : years;
}
