"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the RPCs (is_admin() inside SECURITY DEFINER functions).

const codes = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));

const optionalInt = z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().int().min(1).optional());
const optionalNumber = z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().nonnegative().optional());

const RuleInput = z
  .object({
    destination: z.string().regex(/^[A-Za-z]{2}$/),
    kind: z.enum(["aps_certificate", "visa_info", "proof_of_funds", "visa_step", "post_study_work", "work_hours", "banking", "credential_evaluation", "other"]),
    title: z.string().trim().min(3).max(200),
    details: z.string().trim().max(1000),
    source: z.url(),
    quote: z.string().trim().min(3).max(1000),
    amount: optionalNumber,
    currency: z.preprocess((v) => (v === "" ? undefined : String(v).toUpperCase()), z.string().regex(/^[A-Z]{3}$/).optional()),
    period: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["per_month", "per_year", "total"]).optional()),
    months: optionalInt,
    hours_per_week: optionalInt,
    region: z.string().trim().max(60),
    step: z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().int().min(0).optional()),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, message: string) => ok || ctx.addIssue({ code: "custom", message });
    if (v.amount !== undefined) need(Boolean(v.currency && v.period), "An amount needs a currency and a period");
    if (v.kind === "post_study_work") need(v.months !== undefined, "A post study work rule needs months");
    if (v.kind === "work_hours") need(v.hours_per_week !== undefined, "A work hours rule needs hours per week");
  });

export async function addRule(form: FormData) {
  const fields = ["destination", "kind", "title", "details", "source", "quote", "amount", "currency", "period", "months", "hours_per_week", "region", "step"];
  const input = RuleInput.parse(Object.fromEntries(fields.map((k) => [k, form.get(k) ?? ""])));
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_country_rule", {
    p_destination: input.destination,
    p_kind: input.kind,
    p_title: input.title,
    p_source_url: input.source,
    p_quote: input.quote,
    p_applies_to: codes(form.get("applies_to")),
    p_details: input.details || undefined,
    p_amount: input.amount,
    p_currency: input.currency,
    p_period: input.period,
    p_months: input.months,
    p_hours_per_week: input.hours_per_week,
    p_region: input.region || undefined,
    p_step: input.step,
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
