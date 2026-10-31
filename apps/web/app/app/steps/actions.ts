"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { allowedAction, returnPath, type StepAction } from "@/lib/journey-actions";
import { getJourney } from "@/lib/journey-request.server";
import { utcToday } from "@/lib/journey-snapshot";
import { getUser } from "@/lib/supabase/server";

const SNOOZE_DAYS = 7;

/** The date `days` from today (UTC), as the start of that day. */
function daysFromToday(days: number): string {
  const d = new Date(`${utcToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Snooze, dismiss, mark done or bring back a step (journey M2, J2.4). The step must be in the
 * student's own current journey; the database checks ownership and consent again (RLS).
 */
async function act(action: StepAction, stepId: string, form: FormData) {
  const back = returnPath(form.get("from"));
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const { result } = await getJourney();
  if (!allowedAction(result, stepId, action)) redirect(back);

  const table = supabase.from("journey_step_state");
  const row = { user_id: user.id, step_id: stepId, updated_at: new Date().toISOString() };
  const { error } =
    action === "restore"
      ? await table.delete().eq("user_id", user.id).eq("step_id", stepId)
      : action === "snooze"
        ? await table.upsert({ ...row, state: "snoozed", until: daysFromToday(SNOOZE_DAYS) }, { onConflict: "user_id,step_id" })
        : await table.upsert({ ...row, state: action === "dismiss" ? "dismissed" : "done", until: null }, { onConflict: "user_id,step_id" });
  if (error) {
    console.error(`journey step ${action} failed: ${error.message}`);
    redirect(back);
  }
  // The home, the steps page and the navigation badge all recompute on the next render.
  revalidatePath("/app", "layout");
  redirect(`${back}?did=${action}&step=${encodeURIComponent(stepId)}`);
}

export async function snoozeStep(stepId: string, form: FormData) {
  await act("snooze", stepId, form);
}

export async function dismissStep(stepId: string, form: FormData) {
  await act("dismiss", stepId, form);
}

export async function markStepDone(stepId: string, form: FormData) {
  await act("markDone", stepId, form);
}

export async function restoreStep(stepId: string, form: FormData) {
  await act("restore", stepId, form);
}
