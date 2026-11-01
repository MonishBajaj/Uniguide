"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// M7 A1.7: AI-policy facts. Authorisation lives in the RPCs (is_admin() inside SECURITY DEFINER functions).

export async function addPolicy(form: FormData) {
  const input = z
    .object({
      slug: z.string().trim().min(1),
      policy: z.enum(["allows", "limited", "bans"]),
      source: z.url(),
      quote: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(["slug", "policy", "source", "quote"].map((k) => [k, form.get(k) ?? ""])));
  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("id").eq("slug", input.slug).single();
  if (!program) throw new Error("No course with that slug");
  const { error } = await supabase.rpc("add_program_ai_policy", {
    p_program_id: program.id,
    p_policy: input.policy,
    p_source_url: input.source,
    p_quote: input.quote,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ai-policies");
}

export async function verifyPolicy(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_program_ai_policy", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ai-policies");
}
