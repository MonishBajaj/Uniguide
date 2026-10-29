"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the RPCs: admins and the verifiers of the institution's country.

const KINDS = ["assistantship", "on_campus_work", "housing_on_campus", "housing_off_campus", "transit_pass", "parking", "airport", "arrival_support", "course_registration", "health_insurance", "international_office", "student_societies", "faith_and_culture_facilities"] as const;
const num = z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().nonnegative().optional());
const int = z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().int().min(1).max(80).optional());
const blank = (v: unknown) => (v === "" ? undefined : v);

const Input = z
  .object({
    institution: z.uuid(),
    program: z.preprocess(blank, z.uuid().optional()),
    kind: z.enum(KINDS),
    title: z.string().trim().min(3).max(200),
    details: z.string().trim().max(1000),
    source: z.url(),
    quote: z.string().trim().min(3).max(1000),
    amount: num,
    currency: z.preprocess((v) => (v === "" ? undefined : String(v).toUpperCase()), z.string().regex(/^[A-Z]{3}$/).optional()),
    period: z.preprocess(blank, z.enum(["per_month", "per_term", "per_year", "one_off"]).optional()),
    hours_per_week: int,
  })
  .refine((v) => v.amount === undefined || (v.currency && v.period), { message: "An amount needs a currency and a period" });

export async function addFact(form: FormData) {
  const fields = ["institution", "program", "kind", "title", "details", "source", "quote", "amount", "currency", "period", "hours_per_week"];
  const v = Input.parse(Object.fromEntries(fields.map((k) => [k, form.get(k) ?? ""])));
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_institution_fact", {
    p_institution: v.institution,
    p_kind: v.kind,
    p_title: v.title,
    p_source_url: v.source,
    p_quote: v.quote,
    p_program: v.program,
    p_details: v.details || undefined,
    p_amount: v.amount,
    p_currency: v.currency,
    p_period: v.period,
    p_hours_per_week: v.hours_per_week,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/institution-facts");
}

export async function verifyFact(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_institution_fact", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/institution-facts");
}
