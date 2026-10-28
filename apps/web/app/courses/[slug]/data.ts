import "server-only";
import { cache } from "react";
import { factsFor, toInstitutionFact } from "@/lib/institution-facts";
import { createClient } from "@/lib/supabase/server";

const FACT_KINDS = ["assistantship", "on_campus_work", "housing_on_campus", "housing_off_campus", "transit_pass", "parking", "health_insurance", "airport", "arrival_support", "course_registration"] as const;

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

export async function loadCourseExtras(programId: string, institutionId: string, country: string) {
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
  const [{ data: factRows }, { data: workRows }] = await Promise.all([
    supabase.from("institution_facts").select("*").eq("institution_id", institutionId).order("created_at"),
    supabase.from("country_rules").select("*").eq("destination", country).eq("kind", "work_hours").order("verified_at", { ascending: false, nullsFirst: false }),
  ]);
  const facts = factsFor((factRows ?? []).map(toInstitutionFact), programId, [...FACT_KINDS]);
  const workRules = (workRows ?? []).filter((r) => r.applies_to.length === 0).slice(0, 1).map((r) => ({
    id: r.id, title: r.title, hoursPerWeek: r.hours_per_week, status: r.status, evidenceQuote: r.evidence_quote, link: r.link,
  }));
  return { supabase, user, cycles: cycles ?? [], admin: admin.data ? { sources } : null, interests, similar, facts, workRules };
}
