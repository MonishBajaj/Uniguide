export const LETTER_STATUSES = {
  not_asked: "Not asked yet",
  asked: "Asked",
  agreed: "Agreed",
  submitted: "Submitted",
  declined: "Declined",
} as const;
export type LetterStatus = keyof typeof LETTER_STATUSES;

/**
 * Letters still counting toward an application: a declined request does not. "Needed" comes from the
 * course's published requirement (count_required), and is null when the course has not published one.
 */
export function letterProgress(requests: { status: string }[], needed: number | null) {
  const active = requests.filter((r) => r.status !== "declined");
  return {
    submitted: active.filter((r) => r.status === "submitted").length,
    lined_up: active.filter((r) => r.status === "agreed" || r.status === "submitted").length,
    needed,
    short: needed != null ? Math.max(0, needed - active.filter((r) => r.status !== "not_asked").length) : null,
  };
}

/** The largest published letter count across an application's requirement rows. */
export function lettersNeeded(requirements: { kind: string; count_required: number | null }[]): number | null {
  const counts = requirements.filter((r) => r.kind === "recommendation_letters" && r.count_required != null).map((r) => r.count_required!);
  return counts.length ? Math.max(...counts) : null;
}
