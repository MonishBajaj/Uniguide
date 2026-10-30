import "server-only";
import { applicantCategories, buildChecklist } from "@uniguide/matching";
import { loadCurrentCycles, toProgramInput } from "@/lib/catalog";
import { QUALIFICATIONS } from "@/lib/fields";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Creates the tracker card for a course (its current intake) with a checklist seeded from the
 * course's published requirements and deadlines. Idempotent: an existing card is left alone.
 */
export async function ensureApplication(supabase: Supabase, userId: string, programId: string): Promise<string | null> {
  const { data: card } = await supabase.from("program_cards").select("*").eq("id", programId).maybeSingle();
  const cycle = (await loadCurrentCycles(supabase, [programId])).get(programId);
  if (!card || !cycle) return null;

  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: profile } = await supabase.from("profiles").select("residence_country").eq("user_id", userId).single();
  const residence = profile?.residence_country ?? "";
  const { data: rules } = await supabase.from("country_rules").select("id, kind, title, details, link, applies_to, region").eq("destination", card.country!);
  const countryRules = (rules ?? []).filter((r) => r.applies_to.length === 0 || r.applies_to.includes(residence));
  const program = toProgramInput(card, cycle);
  const deadlines = cycle.deadlines.map((d) => ({
    ...program.deadlines.find((p) => p.id === d.id)!,
    round: d.round,
    owningSystem: d.owning_system,
  }));
  const items = buildChecklist(
    program.requirements,
    deadlines,
    applicantCategories(residence, card.country!),
    new Date(),
    (code) => QUALIFICATIONS[code] ?? code,
    countryRules,
  );
  const nextDue = items.find((i) => i.kind === "deadline")?.dueAt ?? null;

  const { data: app, error } = await supabase
    .from("applications")
    .insert({ user_id: userId, cycle_id: cycle.id, due_at: nextDue })
    .select("id")
    .single();
  if (error || !app) return null;
  if (items.length) {
    await supabase.from("checklist_items").insert(
      items.map((i) => ({
        application_id: app.id,
        user_id: userId,
        title: i.title,
        details: i.details ?? null,
        link: i.link ?? null,
        kind: i.kind,
        sort: i.sort,
        due_at: i.dueAt,
        requirement_id: i.requirementId ?? null,
        deadline_id: i.deadlineId ?? null,
        country_rule_id: i.countryRuleId ?? null,
      })),
    );
  }
  return app.id;
}

