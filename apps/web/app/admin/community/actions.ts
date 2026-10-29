"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the RPCs (is_admin() inside SECURITY DEFINER functions).

const done = () => revalidatePath("/", "layout");

export async function moderatePost(postId: string, status: "published" | "rejected" | "removed", form: FormData) {
  const supabase = await createClient();
  const note = String(form.get("note") ?? "").trim() || undefined;
  const { error } = await supabase.rpc("moderate_community_post", { p_post: postId, p_status: status, p_note: note });
  if (error) throw new Error(error.message);
  done();
}

export async function resolveReport(reportId: string, uphold: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_community_report", { p_report: reportId, p_uphold: uphold });
  if (error) throw new Error(error.message);
  done();
}

export async function reviewAlum(id: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_community_alum", { p_id: id, p_approve: approve });
  if (error) throw new Error(error.message);
  done();
}

export async function createAma(form: FormData) {
  const supabase = await createClient();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const { error } = await supabase.from("community_amas").insert({
    title: get("title"),
    host_name: get("host_name"),
    host_role: get("host_role") || null,
    topic: get("topic") || null,
    // datetime-local values, entered in UTC as the form says.
    starts_at: new Date(`${get("starts_at")}Z`).toISOString(),
    ends_at: new Date(`${get("ends_at")}Z`).toISOString(),
    published: form.get("published") === "on",
  });
  if (error) throw new Error(error.message);
  done();
}

export async function setAmaPublished(id: string, published: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("community_amas").update({ published }).eq("id", id);
  if (error) throw new Error(error.message);
  done();
}

/** The host's answer, typed in by an admin; it also publishes the question. */
export async function answerAmaQuestion(postId: string, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_ama_question", { p_post: postId, p_answer: String(form.get("answer") ?? "") });
  if (error) throw new Error(error.message);
  done();
}
