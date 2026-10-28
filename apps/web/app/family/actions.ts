"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SITE_URL } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";

export type InviteState = { message: string; link?: string } | null;

/** Student: create a one-time link for a parent or guardian. */
export async function createInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const name = z.string().trim().min(1).max(120).safeParse(form.get("student_name"));
  if (!name.success) return { message: "Give the name your parent knows you by." };
  const { supabase } = await getUser();
  const { data: code, error } = await supabase.rpc("create_parent_invite", { p_student_name: name.data });
  if (error || !code) return { message: error?.message ?? "Could not create the invite." };
  revalidatePath("/app/sharing");
  return { message: "Send this link to your parent or guardian. It works once, for 14 days.", link: `${SITE_URL}/family/join?code=${code}` };
}

/** Student: remove a parent. */
export async function removeParent(parentId: string) {
  const { supabase } = await getUser();
  await supabase.rpc("revoke_parent_link", { p_parent: parentId });
  revalidatePath("/app/sharing");
}

/** Parent: accept an invite from their own account. */
export async function acceptInvite(code: string, _prev: string | null, form: FormData): Promise<string | null> {
  const name = z.string().trim().min(1).max(120).safeParse(form.get("parent_name"));
  if (!name.success) return "Give your name so your child can see who joined.";
  const { supabase } = await getUser();
  const { error } = await supabase.rpc("accept_parent_invite", { p_code: code, p_parent_name: name.data });
  if (error) return error.message;
  redirect("/parent");
}

/** Parent: weekly email on or off for one child. */
export async function setDigest(studentId: string, enabled: boolean) {
  const { supabase } = await getUser();
  await supabase.rpc("set_parent_digest", { p_student: studentId, p_enabled: enabled });
  revalidatePath("/parent");
}
