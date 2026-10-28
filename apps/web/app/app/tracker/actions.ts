"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Enums } from "@uniguide/db-types";
import { POLICY_VERSION } from "@/lib/env";
import { asJson } from "@/lib/json";
import { getUser } from "@/lib/supabase/server";
import { ensureApplication } from "@/lib/tracker";

export async function trackProgram(programId: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const id = await ensureApplication(supabase, user.id, programId);
  revalidatePath("/app/tracker");
  redirect(id ? `/app/tracker/${id}` : "/app/tracker?error=no-intake");
}

const STATUSES = ["shortlisted", "preparing", "submitted", "decided", "withdrawn"] as const;

export async function setStatus(applicationId: string, form: FormData) {
  const status = z.enum(STATUSES).parse(form.get("status"));
  const { supabase } = await getUser();
  await supabase.from("applications").update({ status }).eq("id", applicationId);
  revalidatePath("/app/tracker", "layout");
}

export async function toggleItem(itemId: string, done: boolean) {
  const { supabase } = await getUser();
  await supabase.from("checklist_items").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", itemId);
  revalidatePath("/app/tracker", "layout");
}

export async function addItem(applicationId: string, form: FormData) {
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  if (!title.success) return;
  const due = z.iso.date().safeParse(form.get("due"));
  const { supabase, user } = await getUser();
  await supabase.from("checklist_items").insert({
    application_id: applicationId,
    user_id: user!.id,
    title: title.data,
    kind: "custom",
    sort: 1000,
    due_at: due.success ? `${due.data}T00:00:00Z` : null,
  });
  revalidatePath(`/app/tracker/${applicationId}`);
}

export async function saveNotes(applicationId: string, form: FormData) {
  const notes = String(form.get("notes") ?? "").slice(0, 4000);
  const { supabase } = await getUser();
  await supabase.from("applications").update({ notes }).eq("id", applicationId);
  revalidatePath(`/app/tracker/${applicationId}`);
}

const Decision = z.object({
  decision: z.enum(["admitted", "rejected", "waitlisted", "withdrawn", "deferred"]),
  decided_at: z.preprocess((v) => v || null, z.iso.date().nullable()),
  awarded_aid: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).nullable()),
  awarded_aid_currency: z.preprocess((v) => v || null, z.string().regex(/^[A-Z]{3}$/).nullable()),
  deposit_due_at: z.preprocess((v) => (v ? `${v}T00:00:00Z` : null), z.string().nullable()),
});

export async function recordDecision(applicationId: string, form: FormData) {
  const parsed = Decision.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  if (parsed.data.awarded_aid != null && !parsed.data.awarded_aid_currency) return;
  const { supabase } = await getUser();
  await supabase
    .from("applications")
    .update({ ...parsed.data, decision: parsed.data.decision as Enums<"decision">, status: "decided" })
    .eq("id", applicationId);
  revalidatePath("/app/tracker", "layout");
  revalidatePath("/app/offers");
}

/** Shares the decision for research, under its own consent. The student can withdraw it later. */
export async function shareOutcome(applicationId: string, form: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  if (form.get("consent") === "on") {
    await supabase.from("consents").insert({ user_id: user.id, kind: "outcomes_research", policy_version: POLICY_VERSION, method: "checkbox" });
  }
  const [{ data: app }, { data: profile }, { data: scores }] = await Promise.all([
    supabase.from("applications").select("*, program_cycles(program_id)").eq("id", applicationId).single(),
    supabase.from("profiles").select("home_qualification, grade_value, grade_scale, residence_country").eq("user_id", user.id).single(),
    supabase.from("test_scores").select("exam, exam_version, total, sections"),
  ]);
  if (!app?.decision || !app.program_cycles) return;
  await supabase.from("outcomes").insert({
    application_id: app.id,
    user_id: user.id,
    program_id: app.program_cycles.program_id,
    cycle_id: app.cycle_id,
    decision: app.decision,
    funding_offered: app.awarded_aid != null ? app.awarded_aid > 0 : null,
    funding_amount: app.awarded_aid,
    funding_currency: app.awarded_aid_currency,
    decided_at: app.decided_at,
    profile_snapshot: asJson({ ...profile, scores: scores ?? [] }),
  });
  revalidatePath(`/app/tracker/${applicationId}`);
}

export async function withdrawOutcome(applicationId: string) {
  const { supabase } = await getUser();
  await supabase.from("outcomes").delete().eq("application_id", applicationId);
  revalidatePath(`/app/tracker/${applicationId}`);
}

export async function deleteApplication(applicationId: string) {
  const { supabase } = await getUser();
  await supabase.from("applications").delete().eq("id", applicationId);
  revalidatePath("/app/tracker");
  redirect("/app/tracker");
}
