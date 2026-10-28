"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the RPCs (is_admin() inside SECURITY DEFINER functions).

export async function approve(versionId: string, form: FormData) {
  const supabase = await createClient();
  const status = form.get("status") === "conflicting" ? "conflicting" : "verified";
  const { error } = await supabase.rpc("promote_fact_version", { p_version_id: versionId, p_status: status });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}

export async function reject(versionId: string, form: FormData) {
  const supabase = await createClient();
  const reason = String(form.get("reason") ?? "").trim() || "Rejected by reviewer";
  const { error } = await supabase.rpc("reject_fact_version", { p_version_id: versionId, p_reason: reason });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}
