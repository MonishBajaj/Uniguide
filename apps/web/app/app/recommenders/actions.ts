"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

const date = z.preprocess((v) => v || null, z.iso.date().nullable());
const STATUS = z.enum(["not_asked", "asked", "agreed", "submitted", "declined"]);
const done = () => revalidatePath("/app", "layout");

export async function addRecommender(form: FormData) {
  const input = z
    .object({ name: z.string().trim().min(1).max(120), relationship: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(120).nullable()) })
    .safeParse({ name: form.get("name"), relationship: form.get("relationship") });
  if (!input.success) return;
  const { supabase, user } = await getUser();
  await supabase.from("recommenders").insert({ user_id: user!.id, ...input.data });
  done();
}

export async function removeRecommender(id: string) {
  const { supabase } = await getUser();
  await supabase.from("recommenders").delete().eq("id", id);
  done();
}

export async function addRequest(recommenderId: string, form: FormData) {
  const input = z
    .object({ application_id: z.string().uuid(), status: STATUS, due_on: date })
    .safeParse({ application_id: form.get("application_id"), status: form.get("status") ?? "not_asked", due_on: form.get("due_on") });
  if (!input.success) return;
  const { supabase, user } = await getUser();
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("recommendation_requests").insert({
    user_id: user!.id,
    recommender_id: recommenderId,
    ...input.data,
    asked_on: input.data.status === "not_asked" ? null : today,
    submitted_on: input.data.status === "submitted" ? today : null,
  });
  done();
}

/** Status changes stamp when the letter was asked for and when it was submitted. */
export async function updateRequest(id: string, form: FormData) {
  const input = z.object({ status: STATUS, due_on: date }).safeParse({ status: form.get("status"), due_on: form.get("due_on") });
  if (!input.success) return;
  const { supabase } = await getUser();
  const { data: current } = await supabase.from("recommendation_requests").select("asked_on, submitted_on").eq("id", id).maybeSingle();
  if (!current) return;
  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("recommendation_requests")
    .update({
      ...input.data,
      asked_on: input.data.status === "not_asked" ? null : (current.asked_on ?? today),
      submitted_on: input.data.status === "submitted" ? (current.submitted_on ?? today) : null,
    })
    .eq("id", id);
  done();
}

export async function removeRequest(id: string) {
  const { supabase } = await getUser();
  await supabase.from("recommendation_requests").delete().eq("id", id);
  done();
}

/** 6.3 The points the student asks this recommender to mention. */
export async function saveBragNotes(recommenderId: string, form: FormData) {
  const notes = z.string().max(3000).safeParse(String(form.get("brag_notes") ?? "").trim());
  if (!notes.success) return;
  const { supabase } = await getUser();
  await supabase.from("recommenders").update({ brag_notes: notes.data || null }).eq("id", recommenderId);
  done();
}
