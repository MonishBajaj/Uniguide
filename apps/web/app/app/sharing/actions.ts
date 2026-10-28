"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { POLICY_VERSION } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";

const back = (message: string) => redirect(`/app/sharing?message=${encodeURIComponent(message)}`);

export async function grantShare(form: FormData) {
  const input = z
    .object({ code: z.string().trim().min(4).max(40), name: z.string().trim().min(1).max(120), agree: z.literal("on") })
    .safeParse({ code: form.get("code"), name: form.get("name"), agree: form.get("agree") });
  if (!input.success) back("Enter the code, the name your counselor knows you by, and tick the box to agree.");
  const { supabase } = await getUser();
  const { error } = await supabase.rpc("grant_agency_share", {
    p_code: input.data!.code,
    p_display_name: input.data!.name,
    p_policy_version: POLICY_VERSION,
  });
  revalidatePath("/app/sharing");
  back(error ? error.message : "Shared. Your counselor can now see your profile, shortlist and applications.");
}

export async function revokeShare(shareId: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.rpc("revoke_agency_share", { p_share_id: shareId });
  revalidatePath("/app/sharing");
  back(error ? error.message : "Stopped sharing. They can no longer see anything of yours.");
}
