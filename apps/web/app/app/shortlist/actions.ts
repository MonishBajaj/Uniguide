"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { openIntakes } from "@/lib/intakes";
import { getUser } from "@/lib/supabase/server";
import { ensureApplication, moveToIntake } from "@/lib/tracker";

export type ShortlistResult = { ok: boolean; message?: string };

const PENDING = "A parent or guardian needs to confirm before we save your shortlist. Until then it stays on this device.";

export async function addToShortlist(programId: string): Promise<ShortlistResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in to save your shortlist." };
  const { error } = await supabase
    .from("shortlists")
    .upsert({ user_id: user.id, program_id: programId }, { onConflict: "user_id,program_id", ignoreDuplicates: true });
  if (error) return { ok: false, message: error.code === "42501" ? PENDING : "Could not save. Try again." };
  // Shortlisting also opens a tracker card with its checklist and reminders.
  await ensureApplication(supabase, user.id, programId);
  revalidatePath("/app/shortlist");
  revalidatePath("/app/tracker");
  return { ok: true };
}

export async function removeFromShortlist(programId: string): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("shortlists").delete().eq("user_id", user.id).eq("program_id", programId);
  revalidatePath("/app/shortlist");
}

/**
 * Chooses the intake for a shortlisted course (J5.7). Only an intake with an application deadline ahead counts.
 * A still-shortlisted application moves to it with its checklist rebuilt, once the student has agreed if ticked
 * items would start again. A course already being prepared keeps its intake.
 */
export async function chooseIntake(programId: string, form: FormData): Promise<void> {
  const cycleId = z.string().uuid().safeParse(form.get("cycle_id"));
  if (!cycleId.success) return;
  const { supabase, user } = await getUser();
  if (!user) return;
  const { data: cycles } = await supabase
    .from("program_cycles")
    .select("id, label, intake_year, intake_term, deadlines(kind, due_at, status, published)")
    .eq("program_id", programId);
  if (!openIntakes(cycles ?? [], new Date()).some((o) => o.id === cycleId.data)) return;
  const { data: apps } = await supabase
    .from("applications")
    .select("id, status, cycle_id, checklist_items(done, kind), program_cycles!inner(program_id)")
    .eq("user_id", user.id)
    .eq("program_cycles.program_id", programId)
    .neq("status", "withdrawn");
  if ((apps ?? []).some((a) => a.status !== "shortlisted")) return;
  const app = apps?.[0];
  const moving = app != null && app.cycle_id !== cycleId.data;
  if (moving && app.checklist_items.some((i) => i.done && i.kind !== "custom") && form.get("confirm") !== "on") return;
  const { error } = await supabase.from("shortlists").update({ cycle_id: cycleId.data }).eq("user_id", user.id).eq("program_id", programId);
  if (error) return;
  if (moving) await moveToIntake(supabase, user.id, app.id, programId, cycleId.data);
  else if (!app) await ensureApplication(supabase, user.id, programId);
  revalidatePath("/app/shortlist");
  revalidatePath("/app/tracker", "layout");
}

/** Moves a shortlist kept on this device (before signing in) into the account. Idempotent. */
export async function mergeLocalShortlist(programIds: string[]): Promise<ShortlistResult> {
  const { supabase, user } = await getUser();
  if (!user || programIds.length === 0) return { ok: false };
  const ids = programIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 200);
  const { error } = await supabase
    .from("shortlists")
    .upsert(ids.map((program_id) => ({ user_id: user.id, program_id })), {
      onConflict: "user_id,program_id",
      ignoreDuplicates: true,
    });
  if (error) return { ok: false, message: error.code === "42501" ? PENDING : "Could not save." };
  for (const id of ids) await ensureApplication(supabase, user.id, id);
  revalidatePath("/app/shortlist");
  return { ok: true };
}
