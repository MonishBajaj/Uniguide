"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Enums } from "@uniguide/db-types";
import { CURRENCIES, EXAMS, FIELDS, GRADE_SCALES, QUALIFICATIONS } from "@/lib/fields";
import { POLICY_VERSION } from "@/lib/env";
import { asJson } from "@/lib/json";
import { LEVELS, DESTINATIONS } from "@/lib/format";
import { extractProfile, MAX_CV_CHARS, PROFILE_MODEL, PROFILE_PROMPT_VERSION, type ProfileExtraction } from "@/lib/profile-extract";
import { startFirstSearch } from "@/lib/start-search";
import { getUser } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;
const PENDING = "A parent or guardian needs to confirm your account before we can save this.";
const failed = (code?: string): FormState => ({ ok: false, message: code === "42501" ? PENDING : "Could not save. Try again." });

const optionalNumber = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().nullable());
const optionalString = z.preprocess((v) => (v === "" || v == null ? null : String(v).trim()), z.string().max(60).nullable());

const Profile = z.object({
  home_qualification: z.enum(Object.keys(QUALIFICATIONS) as [string, ...string[]]).nullable(),
  grade_value: optionalNumber,
  grade_text: optionalString,
  grade_scale: z.enum(Object.keys(GRADE_SCALES) as [string, ...string[]]).nullable(),
  budget_amount: optionalNumber.refine((v) => v == null || v > 0),
  budget_currency: z.enum(CURRENCIES).nullable(),
  target_levels: z.array(z.enum(LEVELS)),
  target_countries: z.array(z.enum(DESTINATIONS)),
  target_fields: z.array(z.enum(Object.keys(FIELDS) as [string, ...string[]])),
  preferred_delivery: z.enum(["on_campus", "online", "hybrid"]).nullable(),
  weights: z.object({ field: z.number(), budget: z.number(), location: z.number(), delivery: z.number() }),
  reminders_enabled: z.boolean(),
  reminder_days: z.array(z.coerce.number().int().min(1).max(90)).max(6),
  research_interests: z.preprocess((v) => (v ? String(v).trim() : null), z.string().max(2000).nullable()),
  prior_credits: optionalNumber.refine((v) => v == null || v > 0),
  prior_credit_system: z.enum(["ects", "us_credit", "uk_cats", "other"]).nullable(),
  class_percentile: optionalNumber.refine((v) => v == null || (Number.isInteger(v) && v >= 1 && v <= 100)),
  show_bands: z.boolean(),
});

export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const orNull = (k: string) => form.get(k) || null;
  const weight = (k: string) => Math.min(10, Math.max(0, Number(form.get(`weight_${k}`) ?? 5))) / 10;
  const parsed = Profile.safeParse({
    home_qualification: orNull("home_qualification"),
    grade_value: form.get("grade_value"),
    grade_text: form.get("grade_text"),
    grade_scale: orNull("grade_scale"),
    budget_amount: form.get("budget_amount"),
    budget_currency: orNull("budget_currency"),
    target_levels: form.getAll("target_levels"),
    // The favourite goes first: the location criterion scores countries by their order.
    target_countries: [...new Set([form.get("favourite_country"), ...form.getAll("target_countries")])].filter(
      (c) => c && form.getAll("target_countries").includes(c),
    ),
    target_fields: form.getAll("target_fields"),
    preferred_delivery: orNull("preferred_delivery"),
    weights: { field: weight("field"), budget: weight("budget"), location: weight("location"), delivery: weight("delivery") },
    reminders_enabled: form.get("reminders_enabled") === "on",
    reminder_days: form.getAll("reminder_days"),
    research_interests: form.get("research_interests"),
    prior_credits: form.get("prior_credits"),
    prior_credit_system: orNull("prior_credit_system"),
    class_percentile: form.get("class_percentile"),
    show_bands: form.get("show_bands") === "on",
  });
  if (!parsed.success) return { ok: false, message: "Some values are not valid. Check numbers are numbers." };
  if (parsed.data.grade_value != null && !parsed.data.grade_scale) {
    return { ok: false, message: "Choose the scale your grade is on, so it is never converted wrongly." };
  }
  if (parsed.data.budget_amount != null && !parsed.data.budget_currency) {
    return { ok: false, message: "Choose the currency of your budget." };
  }

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  if (parsed.data.prior_credits != null && !parsed.data.prior_credit_system) {
    return { ok: false, message: "Choose the credit system of your degree." };
  }
  const { preferred_delivery, weights, show_bands, ...columns } = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      ...columns,
      target_levels: columns.target_levels as Enums<"program_level">[],
      preferences: asJson({ preferredDelivery: preferred_delivery, weights, showBands: show_bands }),
    })
    .eq("user_id", user.id);
  if (error) return failed(error.code);
  revalidatePath("/app", "layout");
  // The first time the profile can drive a search, start it and show the student what is happening.
  if (await startFirstSearch(supabase, user.id)) redirect("/app/matching");
  return { ok: true, message: "Profile saved." };
}

const Score = z.object({
  exam: z.enum(EXAMS),
  exam_version: optionalString,
  taken_on: z.preprocess((v) => v || null, z.iso.date().nullable()),
  total: optionalNumber,
  sections: z.record(z.string(), z.number()),
});

export async function addTestScore(_prev: FormState, form: FormData): Promise<FormState> {
  const sections: Record<string, number> = {};
  for (const s of ["reading", "writing", "listening", "speaking"]) {
    const v = form.get(s);
    if (v !== null && v !== "") sections[s] = Number(v);
  }
  const parsed = Score.safeParse({
    exam: form.get("exam"),
    exam_version: form.get("exam_version"),
    taken_on: form.get("taken_on"),
    total: form.get("total"),
    sections,
  });
  if (!parsed.success || Object.values(sections).some(Number.isNaN)) {
    return { ok: false, message: "Check the exam, date and scores." };
  }
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  const { error } = await supabase.from("test_scores").insert({ ...parsed.data, user_id: user.id });
  if (error) return failed(error.code);
  revalidatePath("/app/profile");
  return { ok: true, message: "Score added." };
}

export async function deleteTestScore(id: string): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("test_scores").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/app/profile");
}

// CV reader --------------------------------------------------------------------

export type ExtractState = { ok: boolean; message: string; extraction?: ProfileExtraction } | null;
const DAILY_AI_RUNS = 10;

export async function readCv(_prev: ExtractState, form: FormData): Promise<ExtractState> {
  const text = String(form.get("cv") ?? "").trim();
  if (text.length < 40) return { ok: false, message: "Paste a little more of your CV or transcript." };
  if (text.length > MAX_CV_CHARS) return { ok: false, message: "That is longer than we read. Paste the education and test score parts." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, message: "The CV reader is not configured on this server." };

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };

  if (form.get("ai_consent") === "on") {
    await supabase.from("consents").insert({ user_id: user.id, kind: "ai_processing", policy_version: POLICY_VERSION, method: "checkbox" });
  }
  const { data: consent } = await supabase
    .from("consents")
    .select("id")
    .eq("kind", "ai_processing")
    .is("withdrawn_at", null)
    .limit(1)
    .maybeSingle();
  if (!consent) return { ok: false, message: "Tick the box to agree to the CV reader first." };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase.from("ai_runs").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= DAILY_AI_RUNS) return { ok: false, message: "You have used the CV reader 10 times today. Try again tomorrow." };

  let run;
  try {
    run = await extractProfile(text);
  } catch {
    return { ok: false, message: "The CV reader is unavailable right now. Fill in the form instead." };
  }
  const { error } = await supabase.from("ai_runs").insert({
    user_id: user.id,
    purpose: "profile_extract",
    model: PROFILE_MODEL,
    prompt_version: PROFILE_PROMPT_VERSION,
    input_tokens: run.inputTokens,
    output_tokens: run.outputTokens,
    cost_usd: run.costUsd,
    latency_ms: run.latencyMs,
    stop_reason: run.stopReason,
    input_hash: run.inputHash,
  });
  if (error) return failed(error.code) as ExtractState;
  if (!run.extraction || (!run.extraction.qualification && run.extraction.test_scores.length === 0)) {
    return { ok: false, message: "We could not find grades or test scores we could quote from that text." };
  }
  return { ok: true, message: "Check each item and keep the ones that are right.", extraction: run.extraction };
}

/** Saves only the items the student ticked. Values come back from the client, so they are re-validated. */
export async function applyCvItems(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  let items: { qualification?: unknown; test_scores?: unknown[] };
  try {
    items = JSON.parse(String(form.get("items") ?? "{}"));
  } catch {
    return { ok: false, message: "Nothing to save." };
  }

  if (items.qualification) {
    const q = z
      .object({
        code: z.enum(Object.keys(QUALIFICATIONS) as [string, ...string[]]),
        grade_value: z.number().nullable(),
        grade_text: z.string().max(60).nullable(),
        grade_scale: z.enum(Object.keys(GRADE_SCALES) as [string, ...string[]]).nullable(),
      })
      .safeParse(items.qualification);
    if (!q.success) return { ok: false, message: "The qualification could not be saved." };
    const { error } = await supabase
      .from("profiles")
      .update({
        home_qualification: q.data.code,
        grade_value: q.data.grade_scale ? q.data.grade_value : null,
        grade_text: q.data.grade_text,
        grade_scale: q.data.grade_scale,
      })
      .eq("user_id", user.id);
    if (error) return failed(error.code);
  }
  for (const raw of items.test_scores ?? []) {
    const s = z
      .object({
        exam: z.enum(EXAMS),
        exam_version: z.string().max(20).nullable(),
        total: z.number().nullable(),
        taken_on: z.iso.date().nullable().catch(null),
        sections: z.array(z.object({ section: z.string().max(30), score: z.number() })),
      })
      .safeParse(raw);
    if (!s.success) continue;
    const { error } = await supabase.from("test_scores").insert({
      user_id: user.id,
      exam: s.data.exam,
      exam_version: s.data.exam_version,
      total: s.data.total,
      taken_on: s.data.taken_on,
      sections: Object.fromEntries(s.data.sections.map((x) => [x.section.toLowerCase(), x.score])),
    });
    if (error) return failed(error.code);
  }
  revalidatePath("/app/profile");
  return { ok: true, message: "Saved the items you kept." };
}

export async function setAiConsent(on: boolean) {
  const { supabase, user } = await getUser();
  if (!user) return;
  if (on) {
    await supabase.from("consents").insert({ user_id: user.id, kind: "ai_processing", policy_version: POLICY_VERSION, method: "checkbox" });
  } else {
    await supabase.from("consents").update({ withdrawn_at: new Date().toISOString() }).eq("kind", "ai_processing").is("withdrawn_at", null);
  }
  revalidatePath("/app", "layout");
}

const Track = z.object({
  name: z.string().trim().min(1).max(60),
  target_levels: z.array(z.enum(LEVELS)).min(1),
  target_countries: z.array(z.enum(DESTINATIONS)),
  target_fields: z.array(z.enum(Object.keys(FIELDS) as [string, ...string[]])),
  budget_amount: optionalNumber.refine((v) => v == null || v > 0),
  budget_currency: z.enum(CURRENCIES).nullable(),
});

/** 1.4 A separate set of targets, such as an MBA alongside an MS. */
export async function addTrack(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = Track.safeParse({
    name: form.get("name"),
    target_levels: form.getAll("target_levels"),
    target_countries: form.getAll("target_countries"),
    target_fields: form.getAll("target_fields"),
    budget_amount: form.get("budget_amount"),
    budget_currency: form.get("budget_currency") || null,
  });
  if (!parsed.success) return { ok: false, message: "Give the track a name and at least one level." };
  const { budget_amount, budget_currency } = parsed.data;
  if ((budget_amount == null) !== (budget_currency == null)) return { ok: false, message: "Give a budget with its currency, or neither." };
  const { supabase, user } = await getUser();
  const { error } = await supabase.from("tracks").insert({
    ...parsed.data,
    user_id: user!.id,
    target_levels: parsed.data.target_levels as Enums<"program_level">[],
  });
  if (error) return error.code === "23505" ? { ok: false, message: "You already have a track with that name." } : failed(error.code);
  revalidatePath("/app", "layout");
  return { ok: true, message: `Added ${parsed.data.name}.` };
}

export async function removeTrack(id: string) {
  const { supabase } = await getUser();
  await supabase.from("tracks").delete().eq("id", id);
  revalidatePath("/app", "layout");
}
