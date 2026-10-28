import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { ASSISTANT_MODEL, ASSISTANT_PROMPT_VERSION, type AssistantRun } from "@/lib/assistant";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const DAILY_LIMIT = 30;

/** AI features need the API key, the student's AI consent and stay under a daily cap. */
export async function aiBlocked(supabase: Supabase): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return "This feature is not configured on this server.";
  const { data: consent } = await supabase
    .from("consents")
    .select("id")
    .eq("kind", "ai_processing")
    .is("withdrawn_at", null)
    .limit(1)
    .maybeSingle();
  if (!consent) return "Turn on AI features first (your profile page has the switch).";
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase.from("ai_runs").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return "You have reached today's limit for AI features. Try again tomorrow.";
  return null;
}

export async function logRun(supabase: Supabase, userId: string, purpose: string, run: AssistantRun<unknown>) {
  await supabase.from("ai_runs").insert({
    user_id: userId,
    purpose,
    model: ASSISTANT_MODEL,
    prompt_version: ASSISTANT_PROMPT_VERSION,
    input_tokens: run.inputTokens,
    output_tokens: run.outputTokens,
    cost_usd: run.costUsd,
    latency_ms: run.latencyMs,
    stop_reason: run.stopReason,
    input_hash: run.inputHash,
  });
}
