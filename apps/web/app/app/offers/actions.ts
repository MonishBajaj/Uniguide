"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asJson } from "@/lib/json";
import { getUser } from "@/lib/supabase/server";

const Matrix = z.object({
  criteria: z.array(z.object({ id: z.string().max(40), label: z.string().trim().min(1).max(80), weight: z.number().int().min(1).max(5) })).max(12),
  scores: z.record(z.string().uuid(), z.record(z.string().max(40), z.number().int().min(1).max(5))),
});

export async function saveMatrix(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = Matrix.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Each criterion needs a name, and weights and scores run from 1 to 5." };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in again." };
  const { error } = await supabase.from("decision_matrices").upsert({
    user_id: user.id,
    criteria: asJson(parsed.data.criteria),
    scores: asJson(parsed.data.scores),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: "Could not save. If a parent still needs to approve your account, saving waits for that." };
  revalidatePath("/app/offers");
  return { ok: true, message: "Saved." };
}

const Gut = z.object({ application_id: z.string().uuid(), reaction: z.enum(["relieved", "disappointed", "unsure"]) });

/** Saves how the student felt when the coin picked an offer. Keeps the latest 50. */
export async function recordGutCheck(input: unknown): Promise<{ ok: boolean }> {
  const parsed = Gut.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false };
  const { data: row } = await supabase.from("decision_matrices").select("gut_checks").maybeSingle();
  const previous = Array.isArray(row?.gut_checks) ? row.gut_checks : [];
  const gut_checks = [...previous, { ...parsed.data, at: new Date().toISOString() }].slice(-50);
  const { error } = await supabase.from("decision_matrices").upsert({ user_id: user.id, gut_checks: asJson(gut_checks), updated_at: new Date().toISOString() });
  revalidatePath("/app/offers");
  return { ok: !error };
}

// After you accept (journey M5, J5.1): the student's own record of conditions, deposit and admission document.

/** Saves the offer's conditions in the student's words; an empty box removes them. */
export async function saveConditions(applicationId: string, form: FormData): Promise<void> {
  const text = String(form.get("conditions") ?? "").trim().slice(0, 1000);
  const { supabase, user } = await getUser();
  if (!user || !z.uuid().safeParse(applicationId).success) return;
  if (text) {
    await supabase.from("offer_conditions").upsert({ application_id: applicationId, user_id: user.id, conditions: text });
  } else {
    await supabase.from("offer_conditions").delete().eq("application_id", applicationId);
  }
  revalidatePath("/app", "layout");
}

const MARKS = ["conditions", "deposit", "document"] as const;

/** Marks conditions met, the deposit paid or the admission document received; or undoes it. */
export async function setEnrollmentMark(applicationId: string, mark: (typeof MARKS)[number], done: boolean): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user || !z.uuid().safeParse(applicationId).success || !MARKS.includes(mark)) return;
  const at = done ? new Date().toISOString() : null;
  if (mark === "conditions") {
    await supabase.from("offer_conditions").update({ met_at: at }).eq("application_id", applicationId);
  } else if (mark === "deposit") {
    await supabase.from("applications").update({ deposit_paid_at: at }).eq("id", applicationId);
  } else {
    await supabase.from("applications").update({ admission_document_received_at: at }).eq("id", applicationId);
  }
  revalidatePath("/app", "layout");
}

