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
