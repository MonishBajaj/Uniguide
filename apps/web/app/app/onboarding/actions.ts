"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Enums, TablesUpdate } from "@uniguide/db-types";
import { aiBlocked, logRun } from "@/lib/ai-usage";
import { onboardingTurn, type OnboardingTurn } from "@/lib/assistant";
import { CURRENCIES, FIELDS, GRADE_SCALES, QUALIFICATIONS } from "@/lib/fields";
import { LEVELS } from "@/lib/format";
import { isCountryCode } from "@/lib/countries";
import { startFirstSearch } from "@/lib/start-search";
import { getUser } from "@/lib/supabase/server";

export type Message = { role: "student" | "assistant"; text: string };
export type TurnResult = { ok: boolean; reply: string; updates: OnboardingTurn["updates"] };

const MAX_TURNS = 4;

export async function nextTurn(history: Message[]): Promise<TurnResult> {
  const clean = history.slice(-12).map((m) => ({ role: m.role, text: String(m.text).slice(0, 1000) }));
  if (clean.filter((m) => m.role === "student").length > MAX_TURNS) {
    return { ok: true, reply: "That is everything I need. Check the suggestions and save the ones that are right.", updates: [] };
  }
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, reply: "Sign in first.", updates: [] };
  const blocked = await aiBlocked(supabase);
  if (blocked) return { ok: false, reply: blocked, updates: [] };
  try {
    const run = await onboardingTurn(clean);
    await logRun(supabase, user.id, "onboarding_chat", run);
    if (!run.parsed) return { ok: false, reply: "Sorry, I could not follow that. Could you say it another way?", updates: [] };
    return { ok: true, reply: run.parsed.reply, updates: run.updates };
  } catch {
    return { ok: false, reply: "The setup chat is unavailable right now. You can fill in the form instead.", updates: [] };
  }
}

const split = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

/** Saves the suggestions the student confirmed, validating each against the same rules as the form. */
export async function applyUpdates(updates: OnboardingTurn["updates"]): Promise<{ ok: boolean; message: string }> {
  const patch: TablesUpdate<"profiles"> = {};
  for (const u of updates) {
    const v = u.value.trim();
    switch (u.field) {
      case "home_qualification": if (v in QUALIFICATIONS) patch.home_qualification = v; break;
      case "grade_scale": if (v in GRADE_SCALES) patch.grade_scale = v; break;
      case "grade_value": if (Number.isFinite(Number(v))) patch.grade_value = Number(v); break;
      case "grade_text": patch.grade_text = v.slice(0, 60); break;
      case "budget_amount": if (Number(v) > 0) patch.budget_amount = Number(v); break;
      case "budget_currency": if ((CURRENCIES as readonly string[]).includes(v.toUpperCase())) patch.budget_currency = v.toUpperCase(); break;
      case "target_levels": patch.target_levels = split(v).filter((l): l is Enums<"program_level"> => (LEVELS as readonly string[]).includes(l)); break;
      case "target_countries": patch.target_countries = split(v.toUpperCase()).filter(isCountryCode); break;
      case "target_fields": patch.target_fields = split(v).filter((f) => f in FIELDS); break;
      case "research_interests": patch.research_interests = v.slice(0, 2000); break;
    }
  }
  if ("grade_value" in patch && !("grade_scale" in patch)) delete patch.grade_value; // never store a grade without its scale
  if (Object.keys(patch).length === 0) return { ok: false, message: "Nothing to save." };
  const { supabase, user } = await getUser();
  const { error } = await supabase.from("profiles").update(patch).eq("user_id", user!.id);
  if (error) return { ok: false, message: error.code === "42501" ? "A parent or guardian needs to confirm your account first." : "Could not save." };
  revalidatePath("/app", "layout");
  if (await startFirstSearch(supabase, user!.id)) redirect("/app/matching");
  return { ok: true, message: "Saved to your profile." };
}
