"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the RPCs: only an organisation's owners may add or remove members.

export async function addMember(form: FormData) {
  const v = z.object({ org: z.uuid(), email: z.email(), role: z.enum(["counselor", "viewer", "owner"]) }).parse({
    org: form.get("org"), email: form.get("email"), role: form.get("role"),
  });
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_add_member", { p_org: v.org, p_email: v.email, p_role: v.role });
  if (error) throw new Error(error.message);
  revalidatePath("/agency/team");
}

export async function removeMember(org: string, user: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_remove_member", { p_org: org, p_user: user });
  if (error) throw new Error(error.message);
  revalidatePath("/agency/team");
}
