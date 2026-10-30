import { createClient } from "@supabase/supabase-js";
import type { Database } from "@uniguide/db-types";
import { bearerMatches, recomputeBatch, validCursor } from "@/lib/journey-cron";
import { utcToday } from "@/lib/journey-snapshot";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Daily journey recompute (spec 4.5), called by the scheduled workflow with
 * `Authorization: Bearer $JOURNEY_CRON_TOKEN` and `?after=<cursor>` for later pages.
 * Uses a cookie-free client, so a browser session never changes whose data is read.
 */
export async function POST(request: Request) {
  const token = process.env.JOURNEY_CRON_TOKEN;
  if (!token) return new Response("Journey recompute is not configured", { status: 503 });
  if (!bearerMatches(request.headers.get("authorization"), token)) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const after = validCursor(new URL(request.url).searchParams.get("after"));
  try {
    return Response.json(await recomputeBatch(supabase, token, after, utcToday()));
  } catch (e) {
    console.error(e);
    return new Response("Journey recompute failed", { status: 500 });
  }
}
