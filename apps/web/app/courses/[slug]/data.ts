import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const loadCard = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("program_cards").select("*").eq("slug", slug).maybeSingle();
  return data;
});

/** Cards for the courses most like this one (same level and field, other institutions), in similarity order. */
async function loadSimilarCards(supabase: Awaited<ReturnType<typeof createClient>>, programId: string) {
  const { data: similar } = await supabase.rpc("similar_programs", { p_program: programId, p_limit: 4 });
  const ids = (similar ?? []).map((p) => p.id);
  if (ids.length === 0) return [];
  const { data: cards } = await supabase.from("program_cards").select("*").in("id", ids);
  return ids.flatMap((id) => cards?.find((c) => c.id === id) ?? []);
}

export async function loadCourseExtras(programId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  const [{ data: cycles }, admin] = await Promise.all([
    supabase.from("program_cycles").select("label, intake_term").eq("program_id", programId).order("intake_year", { ascending: false }),
    user ? supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sources = admin.data ? (await supabase.from("program_sources").select("*").eq("program_id", programId).order("kind")).data ?? [] : [];
  const interests = user
    ? (await supabase.from("profiles").select("research_interests").eq("user_id", user.id).maybeSingle()).data?.research_interests ?? null
    : null;
  const similar = await loadSimilarCards(supabase, programId);
  return { supabase, user, cycles: cycles ?? [], admin: admin.data ? { sources } : null, interests, similar };
}
