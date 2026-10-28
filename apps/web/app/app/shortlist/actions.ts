"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";
import { ensureApplication } from "@/lib/tracker";

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
