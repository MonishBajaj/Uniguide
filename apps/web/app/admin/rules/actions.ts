"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the RPCs (is_admin() inside SECURITY DEFINER functions).

const codes = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));

export async function addRule(form: FormData) {
  const input = z
    .object({
      destination: z.string().regex(/^[A-Za-z]{2}$/),
      kind: z.enum(["aps_certificate", "visa_info", "proof_of_funds", "other"]),
      title: z.string().trim().min(3).max(200),
      details: z.string().trim().max(1000),
      source: z.url(),
      quote: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(["destination", "kind", "title", "details", "source", "quote"].map((k) => [k, form.get(k) ?? ""])));
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_country_rule", {
    p_destination: input.destination,
    p_kind: input.kind,
    p_title: input.title,
    p_source_url: input.source,
    p_quote: input.quote,
    p_applies_to: codes(form.get("applies_to")),
    p_details: input.details || undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/rules");
}

export async function verifyRule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_country_rule", { p_rule_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/rules");
  revalidatePath("/visas");
}

export async function addStat(form: FormData) {
  const input = z
    .object({
      slug: z.string().trim().min(1),
      cycle: z.string().trim().regex(/^\d{4}-[a-z]+$/),
      rate: z.coerce.number().gt(0).max(100),
      source: z.url(),
      quote: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(["slug", "cycle", "rate", "source", "quote"].map((k) => [k, form.get(k) ?? ""])));
  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("id").eq("slug", input.slug).single();
  if (!program) throw new Error("No course with that slug");
  const { error } = await supabase.rpc("add_program_stat", {
    p_program_id: program.id,
    p_cycle_label: input.cycle,
    p_admit_rate: input.rate / 100,
    p_source_url: input.source,
    p_quote: input.quote,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/rules");
}

export async function verifyStat(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_program_stat", { p_stat_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/rules");
}
