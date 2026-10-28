"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

export type ReportState = { ok: boolean; message: string } | null;

export async function reportOutdated(programId: string, _prev: ReportState, form: FormData): Promise<ReportState> {
  const parsed = z
    .object({
      message: z.string().trim().min(5).max(2000),
      evidence_url: z.preprocess((v) => v || null, z.url().regex(/^https?:\/\//).nullable()),
      fact: z.preprocess((v) => v || null, z.string().regex(/^(requirement|deadline|cost_item):[0-9a-f-]{36}$/).nullable()),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Describe what changed in a few words, and use a full link if you add one." };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in to report outdated information." };
  const [subject, factId] = parsed.data.fact?.split(":") ?? [null, null];
  const { error } = await supabase.from("fact_reports").insert({
    user_id: user.id,
    program_id: programId,
    subject: subject as "requirement" | "deadline" | "cost_item" | null,
    fact_id: factId,
    message: parsed.data.message,
    evidence_url: parsed.data.evidence_url,
  });
  if (error) return { ok: false, message: "Could not send the report. Try again." };
  return { ok: true, message: "Thank you. We check every report against the official page; correct ones earn credits." };
}

// Admin: official pages and intakes for a course. RLS limits these writes to admins.

export async function addSource(programId: string, slug: string, form: FormData) {
  const parsed = z
    .object({
      kind: z.enum(["course", "admissions", "requirements", "international", "fees", "deadlines"]),
      url: z.url().regex(/^https?:\/\//),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { supabase } = await getUser();
  await supabase.from("program_sources").insert({ program_id: programId, ...parsed.data });
  revalidatePath(`/courses/${slug}`);
}

export async function removeSource(sourceId: string, slug: string) {
  const { supabase } = await getUser();
  await supabase.from("program_sources").update({ active: false }).eq("id", sourceId);
  revalidatePath(`/courses/${slug}`);
}

export async function addCycle(programId: string, slug: string, form: FormData) {
  const parsed = z
    .object({
      intake_year: z.coerce.number().int().min(2025).max(2035),
      intake_term: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,20}$/),
      starts_on: z.preprocess((v) => v || null, z.iso.date().nullable()),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { supabase } = await getUser();
  const { error } = await supabase.rpc("add_program_cycle", {
    p_program_id: programId,
    p_intake_year: parsed.data.intake_year,
    p_intake_term: parsed.data.intake_term,
    p_starts_on: parsed.data.starts_on ?? undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/courses/${slug}`);
}
