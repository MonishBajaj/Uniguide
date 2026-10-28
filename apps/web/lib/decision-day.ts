const DAY = 86_400_000;

/** Whole calendar days from today to a reply date (stored as that date at 00:00 UTC). Negative once it has passed. */
export function daysToReply(dueIso: string, now = new Date()): number {
  const due = Date.parse(dueIso.slice(0, 10));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / DAY);
}

export function replyText(days: number): string {
  if (days < 0) return `Reply date passed ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Reply due today";
  if (days === 1) return "Reply due tomorrow";
  return `Reply due in ${days} days`;
}

/** The offer whose reply is due soonest, counting only dates still to come (today included). */
export function firstReply<T extends { due: string | null }>(offers: T[], now = new Date()): (T & { days: number }) | null {
  const upcoming = offers
    .flatMap((o) => (o.due ? [{ ...o, days: daysToReply(o.due, now) }] : []))
    .filter((o) => o.days >= 0)
    .sort((a, b) => a.days - b.days);
  return upcoming[0] ?? null;
}

export const REACTIONS = { relieved: "Relieved", disappointed: "Disappointed", unsure: "Not sure" } as const;
export type Reaction = keyof typeof REACTIONS;
export type GutCheck = { application_id: string; reaction: Reaction; at: string };

/** How the student felt each time the coin picked an offer, per offer. */
export function tallyGutChecks(checks: GutCheck[]): Map<string, Record<Reaction, number>> {
  const tally = new Map<string, Record<Reaction, number>>();
  for (const c of checks) {
    const row = tally.get(c.application_id) ?? { relieved: 0, disappointed: 0, unsure: 0 };
    if (c.reaction in row) row[c.reaction] += 1;
    tally.set(c.application_id, row);
  }
  return tally;
}
