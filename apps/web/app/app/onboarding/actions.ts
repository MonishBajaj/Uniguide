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
import { z } from "zod";
import { profileChecklist } from "@uniguide/journey";
import { DESTINATIONS } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { isEntryPath, onboardingEnd } from "@/lib/onboarding";

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

/* Journey M2 (J2.6): the three onboarding screens. */

/** "Skip for now": the student counts as exploring, so /app doesn't send them back here. */
export async function skipOnboarding() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  await supabase.from("profiles").update({ entry_path: "exploring" }).eq("user_id", user.id).is("entry_path", null);
  revalidatePath("/app", "layout");
  redirect("/app");
}

/** Screen 2: "Where are you right now?" */
export async function saveEntryPath(form: FormData) {
  const entry = form.get("entry_path");
  if (!isEntryPath(entry)) redirect("/app/onboarding?screen=2&missing=1");
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  await supabase.from("profiles").update({ entry_path: entry }).eq("user_id", user.id);
  redirect("/app/onboarding?screen=3");
}

export type ShortProfileState = { message: string; values: Record<string, string | string[]> } | null;

const ShortProfile = z.object({
  target_levels: z.array(z.enum(LEVELS)),
  target_countries: z.array(z.enum(DESTINATIONS)),
  target_fields: z.array(z.enum(Object.keys(FIELDS) as [string, ...string[]])),
  budget_amount: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().positive().finite().nullable()),
  budget_currency: z.preprocess((v) => (v ? v : null), z.enum(CURRENCIES).nullable()),
  intake_year: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(2000).max(2100).nullable()),
});

/**
 * Screen 3: the short profile. Saves only what matching needs, then ends where the entry answer
 * points: first matches when matching has what it needs, otherwise the home (plan J2.6).
 */
export async function saveShortProfile(_prev: ShortProfileState, form: FormData): Promise<ShortProfileState> {
  const t = (await getLocale()).t.journey.onboarding;
  const values = {
    target_levels: form.getAll("target_levels").map(String),
    target_countries: form.getAll("target_countries").map(String),
    target_fields: form.getAll("target_fields").map(String),
    budget_amount: String(form.get("budget_amount") ?? ""),
    budget_currency: String(form.get("budget_currency") ?? ""),
    intake_year: String(form.get("intake_year") ?? ""),
  };
  const parsed = ShortProfile.safeParse(values);
  if (!parsed.success) return { message: t.invalid, values };
  if ((parsed.data.budget_amount == null) !== (parsed.data.budget_currency == null)) return { message: t.budgetBoth, values };

  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const { data: before } = await supabase.from("profiles").select("entry_path").eq("user_id", user.id).single();
  const entry = isEntryPath(before?.entry_path) ? before.entry_path : "exploring";
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, target_levels: parsed.data.target_levels as Enums<"program_level">[], entry_path: entry })
    .eq("user_id", user.id)
    .select()
    .single();
  if (error || !profile) return { message: error?.code === "42501" ? "A parent or guardian needs to confirm your account first." : t.invalid, values };

  revalidatePath("/app", "layout");
  const ready = profileChecklist(profile, 0).every((i) => i.key === "tests" || i.done);
  if (ready && (entry === "exploring" || entry === "knows")) await startFirstSearch(supabase, user.id);
  redirect(onboardingEnd(entry, ready));
}
