import "server-only";
import { courseStart, departureTimeline, type CountryRule } from "@/lib/departure";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The accepted offer, its course start and its checklist, shared by the page and the calendar. */
export async function loadDeparture(supabase: Supabase, userId: string) {
  const [{ data: app }, { data: profile }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, program_cycles(starts_on, intake_year, intake_term, label, programs(slug, title, official_url, institutions(name, country))), departure_tasks(task_key)")
      .eq("user_id", userId)
      .not("offer_accepted_at", "is", null)
      .maybeSingle(),
    supabase.from("profiles").select("residence_country").eq("user_id", userId).single(),
  ]);
  const cycle = app?.program_cycles;
  const program = cycle?.programs;
  if (!app || !cycle || !program?.institutions) return null;
  const { data: rules } = await supabase
    .from("country_rules")
    .select("id, kind, title, details, link, status, applies_to")
    .eq("destination", program.institutions.country)
    .order("kind");
  const residence = profile?.residence_country;
  const applicable: CountryRule[] = (rules ?? []).filter((r) => r.applies_to.length === 0 || (residence != null && r.applies_to.includes(residence)));
  const start = courseStart(cycle);
  return {
    app,
    program,
    start,
    tasks: departureTimeline(applicable, start?.date ?? null),
    done: new Set(app.departure_tasks.map((t) => t.task_key)),
  };
}
