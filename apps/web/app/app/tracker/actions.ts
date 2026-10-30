"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Enums } from "@uniguide/db-types";
import { POLICY_VERSION } from "@/lib/env";
import { asJson } from "@/lib/json";
import { getUser } from "@/lib/supabase/server";
import { applyingHref, canStartApplying } from "@/lib/applying";
import { ensureApplication } from "@/lib/tracker";

export async function trackProgram(programId: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const id = await ensureApplication(supabase, user.id, programId);
  revalidatePath("/app/tracker");
  redirect(id ? `/app/tracker/${id}` : "/app/tracker?error=no-intake");
}

/**
 * "I'm applying to this" (J3.2): a shortlisted application moves to preparing. Its checklist was built when it
 * was tracked, so nothing is rebuilt. Anything past shortlisted is left alone.
 */
export async function startApplying(applicationId: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const { data: app } = await supabase.from("applications").select("id, status").eq("id", applicationId).maybeSingle();
  if (!app) redirect("/app/tracker");
  if (canStartApplying(app.status)) await supabase.from("applications").update({ status: "preparing" }).eq("id", app.id);
  revalidatePath("/app", "layout");
  redirect(applyingHref(app.id));
}

/** The same from a shortlist card, which knows the course: tracks it first if its application was deleted. */
export async function startApplyingTo(programId: string) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const id = await ensureApplication(supabase, user.id, programId);
  if (!id) redirect("/app/tracker?error=no-intake");
  await startApplying(id);
}

/** Moves an application to one of the student's tracks, or back to Main (1.4). */
export async function setApplicationTrack(applicationId: string, form: FormData) {
  const value = form.get("track_id");
  const trackId = typeof value === "string" && z.uuid().safeParse(value).success ? value : null;
  const { supabase } = await getUser();
  await supabase.from("applications").update({ track_id: trackId }).eq("id", applicationId);
  revalidatePath("/app/tracker", "layout");
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
  // Catalogue applications only: an own application (J3.3) has no course to share an outcome for.
  if (!app?.decision || !app.program_cycles || !app.cycle_id) return;
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

/** "Checked the portal today" (with an optional note) or a plain note, added to the application's history. */
export async function logPortal(applicationId: string, kind: "portal_check" | "note", form: FormData) {
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (kind === "note" && !note) return;
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("application_events").insert({ application_id: applicationId, user_id: user.id, kind, note: note || null });
  revalidatePath("/app/tracker", "layout");
}

const ScoreSent = z.object({ test_score_id: z.string().uuid(), sent_on: z.iso.date() });

/** Records that one of the student's own scores was sent to this application. */
export async function recordScoreSent(applicationId: string, form: FormData) {
  const parsed = ScoreSent.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("score_reports").insert({ user_id: user.id, application_id: applicationId, ...parsed.data });
  revalidatePath("/app/tracker", "layout");
}

export async function markScoreReceived(reportId: string, form: FormData) {
  const received = z.iso.date().safeParse(form.get("received_on"));
  if (!received.success) return;
  const { supabase } = await getUser();
  await supabase.from("score_reports").update({ received_on: received.data }).eq("id", reportId);
  revalidatePath("/app/tracker", "layout");
}

export async function removeScoreReport(reportId: string) {
  const { supabase } = await getUser();
  await supabase.from("score_reports").delete().eq("id", reportId);
  revalidatePath("/app/tracker", "layout");
}

const Cost = z.object({
  kind: z.enum(["application_fee", "score_send", "exam", "deposit", "other"]),
  amount: z.coerce.number().positive().lt(1_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paid_on: z.preprocess((v) => v || null, z.iso.date().nullable()),
  application_id: z.preprocess((v) => v || null, z.string().uuid().nullable()),
  note: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null), z.string().nullable()),
});

/** Records something the student paid while applying, optionally against one application. */
export async function addCost(form: FormData) {
  const parsed = Cost.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("application_costs").insert({ user_id: user.id, ...parsed.data });
  revalidatePath("/app/tracker", "layout");
}

export async function removeCost(costId: string) {
  const { supabase } = await getUser();
  await supabase.from("application_costs").delete().eq("id", costId);
  revalidatePath("/app/tracker", "layout");
}
