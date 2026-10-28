"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asJson } from "@/lib/json";
import { getUser } from "@/lib/supabase/server";
import { lint } from "@/lib/writing/lint";
import { compareDrafts, REVIEW_MODEL, REVIEW_PROMPT_VERSION, reviewDraft, type Run } from "@/lib/writing/review";
import { countWords, segment } from "@/lib/writing/segment";

export type ActionState = { ok: boolean; message: string } | null;
const PENDING = "A parent or guardian needs to confirm your account before we can save this.";

export async function createDocument(form: FormData) {
  const parsed = z
    .object({
      kind: z.enum(["statement_of_purpose", "personal_statement", "why_this_university", "continued_interest", "other"]),
      title: z.string().trim().min(1).max(200),
      word_limit: z.preprocess((v) => (v ? Number(v) : null), z.number().int().min(50).max(5000).nullable()),
      question: z.preprocess((v) => (v ? String(v).trim() : null), z.string().max(2000).nullable()),
      application_id: z.preprocess((v) => v || null, z.uuid().nullable()),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/app/writing/new?error=1");
  const { supabase, user } = await getUser();
  const { data, error } = await supabase.from("documents").insert({ ...parsed.data, user_id: user!.id }).select("id").single();
  if (error || !data) redirect(`/app/writing/new?error=${error?.code === "42501" ? "consent" : "1"}`);
  redirect(`/app/writing/${data.id}`);
}

const Authorship = z.object({
  typed_chars: z.number().int().min(0),
  pasted_chars: z.number().int().min(0),
  deleted_chars: z.number().int().min(0),
  paste_events: z.array(z.object({ at: z.string(), chars: z.number().int() })).max(500),
  session_started_at: z.string(),
  active_seconds: z.number().int().min(0),
});

/**
 * Opens the student's document of this kind for an application, creating it the first time: a
 * "why this university" statement for any application, a letter of continued interest only when
 * the application is waitlisted.
 */
export async function startLinkedDocument(applicationId: string, kind: "why_this_university" | "continued_interest") {
  const { supabase, user } = await getUser();
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("application_id", applicationId)
    .eq("kind", kind)
    .limit(1)
    .maybeSingle();
  if (existing) redirect(`/app/writing/${existing.id}`);
  const { data: app } = await supabase
    .from("applications")
    .select("decision, program_cycles(programs(title, institutions(name)))")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app || (kind === "continued_interest" && app.decision !== "waitlisted")) redirect(`/app/tracker/${applicationId}`);
  const program = app.program_cycles?.programs;
  const title =
    kind === "continued_interest"
      ? `Letter of continued interest: ${program?.title ?? "course"}`
      : `Why ${program?.institutions?.name ?? "this university"}: ${program?.title ?? "course"}`;
  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: user!.id,
      application_id: applicationId,
      kind,
      title: title.slice(0, 200),
      word_limit: kind === "continued_interest" ? 300 : null,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/app/tracker/${applicationId}?error=${error?.code === "42501" ? "consent" : "1"}`);
  redirect(`/app/writing/${data.id}`);
}

export async function saveVersion(documentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const body = String(form.get("body") ?? "");
  if (!body.trim()) return { ok: false, message: "Write something first." };
  if (body.length > 60000) return { ok: false, message: "That is longer than we can store in one draft." };
  let authorship;
  try {
    authorship = Authorship.parse(JSON.parse(String(form.get("authorship") ?? "{}")));
  } catch {
    return { ok: false, message: "Could not record the editing history for this draft." };
  }
  const { supabase, user } = await getUser();
  const { error } = await supabase.from("document_versions").insert({
    document_id: documentId,
    user_id: user!.id,
    body,
    word_count: countWords(body),
    authorship: asJson({ ...authorship, saved_at: new Date().toISOString(), editor: "uniguide" }),
  });
  if (error) return { ok: false, message: error.code === "42501" ? PENDING : "Could not save the draft." };
  revalidatePath(`/app/writing/${documentId}`);
  return { ok: true, message: "Draft saved." };
}

async function logRun(supabase: Awaited<ReturnType<typeof getUser>>["supabase"], userId: string, purpose: string, run: Run<unknown>) {
  const { data } = await supabase
    .from("ai_runs")
    .insert({
      user_id: userId,
      purpose,
      model: run.model ?? REVIEW_MODEL,
      prompt_version: REVIEW_PROMPT_VERSION,
      input_tokens: run.inputTokens,
      output_tokens: run.outputTokens,
      cost_usd: run.costUsd,
      latency_ms: run.latencyMs,
      stop_reason: run.stopReason,
      input_hash: run.inputHash,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function checkAllowance(supabase: Awaited<ReturnType<typeof getUser>>["supabase"], kind: "rubric" | "comparison") {
  if (!process.env.ANTHROPIC_API_KEY) return "Writing feedback is not configured on this server.";
  const { data } = await supabase.rpc("writing_allowance").single();
  if (!data) return "Could not check your credits.";
  if ((kind === "comparison" || !data.free_review) && data.balance < 1) {
    return "You have used your free review. Credits come with the season pass (coming soon) or from correct reports of outdated information.";
  }
  return null;
}

export async function requestReview(documentId: string): Promise<ActionState> {
  const { supabase, user } = await getUser();
  const blocked = await checkAllowance(supabase, "rubric");
  if (blocked) return { ok: false, message: blocked };

  const [{ data: doc }, { data: version }] = await Promise.all([
    supabase.from("documents").select("kind, question, word_limit, applications(program_cycles(programs(title, level, field_label, institutions(name))))").eq("id", documentId).single(),
    supabase.from("document_versions").select("id, body").eq("document_id", documentId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!doc || !version) return { ok: false, message: "Save a draft first." };
  const sentences = segment(version.body);
  if (countWords(version.body) < 80) return { ok: false, message: "Write at least 80 words before asking for feedback." };

  const program = doc.applications?.program_cycles?.programs;
  let run;
  try {
    run = await reviewDraft(sentences, {
      kind: doc.kind,
      question: doc.question,
      wordLimit: doc.word_limit,
      programFacts: program ? [`Course: ${program.title}`, `Institution: ${program.institutions?.name}`, `Field: ${program.field_label ?? ""}`] : [],
    });
  } catch {
    return { ok: false, message: "Feedback is unavailable right now. Nothing was charged." };
  }
  const aiRunId = await logRun(supabase, user!.id, "writing_review", run);
  if (!run.parsed) return { ok: false, message: "We could not produce feedback for this draft. Nothing was charged." };

  const { error } = await supabase.rpc("record_writing_review", {
    p_version_id: version.id,
    p_kind: "rubric",
    p_model: run.model ?? REVIEW_MODEL,
    p_prompt_version: REVIEW_PROMPT_VERSION,
    p_result: asJson({ ...run.parsed, lint: lint(version.body, doc.word_limit).flags }),
    p_ai_run_id: aiRunId ?? undefined,
  });
  if (error) return { ok: false, message: error.message.includes("insufficient") ? "Not enough credits." : "Could not save the feedback." };
  revalidatePath(`/app/writing/${documentId}`);
  return { ok: true, message: "Feedback ready." };
}

export async function compareLatest(documentId: string): Promise<ActionState> {
  const { supabase, user } = await getUser();
  const blocked = await checkAllowance(supabase, "comparison");
  if (blocked) return { ok: false, message: blocked };
  const { data: versions } = await supabase
    .from("document_versions")
    .select("id, body")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(2);
  if (!versions || versions.length < 2) return { ok: false, message: "Save two drafts to compare them." };
  const [latest, previous] = versions as [{ id: string; body: string }, { id: string; body: string }];
  let run;
  try {
    run = await compareDrafts(segment(previous.body), segment(latest.body));
  } catch {
    return { ok: false, message: "Comparison is unavailable right now. Nothing was charged." };
  }
  const aiRunId = await logRun(supabase, user!.id, "draft_comparison", run);
  if (!run.parsed) return { ok: false, message: "We could not compare these drafts. Nothing was charged." };
  const { error } = await supabase.rpc("record_writing_review", {
    p_version_id: latest.id,
    p_compared_version_id: previous.id,
    p_kind: "comparison",
    p_model: run.model ?? REVIEW_MODEL,
    p_prompt_version: REVIEW_PROMPT_VERSION,
    p_result: asJson(run.parsed),
    p_ai_run_id: aiRunId ?? undefined,
  });
  if (error) return { ok: false, message: error.message.includes("insufficient") ? "Not enough credits." : "Could not save the comparison." };
  revalidatePath(`/app/writing/${documentId}`);
  return { ok: true, message: "Comparison ready." };
}

export async function saveStory(questionId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const answer = String(form.get("answer") ?? "").slice(0, 4000);
  const { supabase, user } = await getUser();
  const { error } = await supabase
    .from("story_answers")
    .upsert({ user_id: user!.id, question_id: questionId, answer, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: error.code === "42501" ? PENDING : "Could not save." };
  return { ok: true, message: "Saved." };
}

export async function deleteDocument(documentId: string) {
  const { supabase } = await getUser();
  await supabase.from("documents").delete().eq("id", documentId);
  redirect("/app/writing");
}
