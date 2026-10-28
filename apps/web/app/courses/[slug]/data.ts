import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const loadCard = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("program_cards").select("*").eq("slug", slug).maybeSingle();
  return data;
});

export async function loadCourseExtras(programId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  const [{ data: cycles }, admin] = await Promise.all([
    supabase.from("program_cycles").select("label, intake_term").eq("program_id", programId).order("intake_year", { ascending: false }),
    user ? supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sources = admin.data ? (await supabase.from("program_sources").select("*").eq("program_id", programId).order("kind")).data ?? [] : [];
  return { supabase, user, cycles: cycles ?? [], admin: admin.data ? { sources } : null };
}
