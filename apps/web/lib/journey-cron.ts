/**
 * Journey M1 (J1.7): the daily recompute. The route calls this once per batch; the scheduled job
 * keeps calling with `next` until it is null. Every database call carries the recompute token,
 * which the RPCs check against journey_config, so the web app needs no secret Supabase key.
 */
import { timingSafeEqual } from "node:crypto";
import { type JourneyRpc, loadJourney } from "./journey-snapshot";

export const BATCH_SIZE = 200;

export interface BatchResult {
  processed: number;
  failed: number;
  /** The cursor for the next call, or null when every due student is done. */
  next: string | null;
}

/** Recomputes one page of recently active students. One student's failure doesn't stop the rest. */
export async function recomputeBatch(
  supabase: JourneyRpc,
  token: string,
  after: string | null,
  today: string,
  limit = BATCH_SIZE,
): Promise<BatchResult> {
  const { data, error } = await supabase.rpc("journey_due_users", { p_token: token, p_after: after, p_limit: limit });
  if (error) throw new Error(`journey_due_users failed: ${error.message}`);
  const ids = (data ?? []) as string[];
  let failed = 0;
  for (const userId of ids) {
    try {
      await loadJourney(supabase, today, { userId, token });
    } catch (e) {
      failed++;
      console.error(`journey recompute failed for ${userId}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { processed: ids.length - failed, failed, next: ids.length === limit ? ids.at(-1)! : null };
}

/** True when the Authorization header carries exactly `Bearer <expected>`. Compared in constant time. */
export function bearerMatches(header: string | null, expected: string): boolean {
  const given = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validCursor = (after: string | null) => (after && UUID.test(after) ? after : null);
