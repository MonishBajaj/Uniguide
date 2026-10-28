"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

const text = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max).nullable());
const month = z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : null), z.string().nullable());

const Entry = z
  .object({
    section: z.enum(["education", "experience", "projects", "awards", "skills", "other"]),
    title: z.string().trim().min(1).max(160),
    organisation: text(160),
    location: text(120),
    start_month: month,
    end_month: month,
    current: z.boolean(),
    bullets: z.array(z.string().max(300)).max(8),
  })
  .refine((e) => !e.end_month || !e.start_month || e.end_month >= e.start_month);

function readEntry(form: FormData) {
  const bullets = String(form.get("bullets") ?? "")
    .split("\n")
    .map((b) => b.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const parsed = Entry.safeParse({
    section: form.get("section"),
    title: form.get("title"),
    organisation: form.get("organisation"),
    location: form.get("location"),
    start_month: form.get("start"),
    end_month: form.get("end"),
    current: form.get("current") === "on",
    bullets,
  });
  if (!parsed.success) return null;
  const { current, ...entry } = parsed.data;
  return { ...entry, end_month: current ? null : entry.end_month };
}

export async function saveHeader(form: FormData) {
  const parsed = z
    .object({ full_name: z.string().trim().min(1).max(120), headline: text(160), contact_line: text(240) })
    .safeParse({ full_name: form.get("full_name"), headline: form.get("headline"), contact_line: form.get("contact_line") });
  if (!parsed.success) return;
  const { supabase, user } = await getUser();
  await supabase.from("cv_headers").upsert({ user_id: user!.id, ...parsed.data, updated_at: new Date().toISOString() });
  revalidatePath("/app/cv", "layout");
}

export async function addEntry(form: FormData) {
  const entry = readEntry(form);
  if (!entry) return;
  const { supabase, user } = await getUser();
  await supabase.from("cv_entries").insert({ user_id: user!.id, ...entry });
  revalidatePath("/app/cv", "layout");
}

export async function updateEntry(id: string, form: FormData) {
  const entry = readEntry(form);
  if (!entry) return;
  const { supabase } = await getUser();
  await supabase.from("cv_entries").update(entry).eq("id", id);
  revalidatePath("/app/cv", "layout");
}

export async function removeEntry(id: string) {
  const { supabase } = await getUser();
  await supabase.from("cv_entries").delete().eq("id", id);
  revalidatePath("/app/cv", "layout");
}
