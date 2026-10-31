/**
 * The intake to plan for after a round of rejections: the year after the later of the student's planned intake
 * and the intakes they were turned down for, and never a year that has already started.
 */
export function nextIntakeYear(current: number | null, rejectedIntakes: number[], now: Date): number {
  const latest = Math.max(current ?? 0, ...rejectedIntakes, now.getUTCFullYear());
  return latest + 1;
}
