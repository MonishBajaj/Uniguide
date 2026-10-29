"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { REPORT_REASONS } from "@/lib/community";
import { getUser } from "@/lib/supabase/server";

const Reason = z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]]);

export async function reportPost(postId: string, form: FormData) {
  const reason = Reason.safeParse(form.get("reason"));
  if (!reason.success) return;
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("community_reports").insert({ post_id: postId, reporter_id: user.id, reason: reason.data, note });
  revalidatePath("/", "layout");
}

/** Authors can take their own post down at any time. */
export async function withdrawPost(postId: string) {
  const { supabase } = await getUser();
  await supabase.from("community_posts").delete().eq("id", postId);
  revalidatePath("/", "layout");
}
