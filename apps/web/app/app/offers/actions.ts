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
