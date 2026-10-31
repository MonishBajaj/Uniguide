import "server-only";
import { applicantCategories, buildChecklist } from "@uniguide/matching";
import { loadCurrentCycles, loadCycleById, toProgramInput } from "@/lib/catalog";
import { QUALIFICATIONS } from "@/lib/fields";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Card = NonNullable<Awaited<ReturnType<typeof loadCard>>>;
type Cycle = NonNullable<Awaited<ReturnType<typeof loadCycleById>>>;

const loadCard = async (supabase: Supabase, programId: string) =>
  (await supabase.from("program_cards").select("*").eq("id", programId).maybeSingle()).data;

/** The checklist for one intake of a course, seeded from its published requirements, deadlines and country rules. */
async function checklistFor(supabase: Supabase, userId: string, card: Card, cycle: Cycle) {
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
  return { items, nextDue: items.find((i) => i.kind === "deadline")?.dueAt ?? null };
}

async function insertItems(supabase: Supabase, userId: string, applicationId: string, items: Awaited<ReturnType<typeof checklistFor>>["items"]) {
  if (!items.length) return;
  await supabase.from("checklist_items").insert(
    items.map((i) => ({
      application_id: applicationId,
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

/**
 * Creates the tracker card for a course with a checklist seeded from the course's published requirements and
 * deadlines. The intake is the one the student chose on their shortlist (J5.7), else the current one.
 * Idempotent: an existing card is left alone.
 */
export async function ensureApplication(supabase: Supabase, userId: string, programId: string): Promise<string | null> {
  const card = await loadCard(supabase, programId);
  const { data: pick } = await supabase.from("shortlists").select("cycle_id").eq("user_id", userId).eq("program_id", programId).maybeSingle();
  const cycle = pick?.cycle_id ? await loadCycleById(supabase, pick.cycle_id) : (await loadCurrentCycles(supabase, [programId])).get(programId);
  if (!card || !cycle) return null;

  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .maybeSingle();
  if (existing) return existing.id;

  const { items, nextDue } = await checklistFor(supabase, userId, card, cycle);
  const { data: app, error } = await supabase
    .from("applications")
    .insert({ user_id: userId, cycle_id: cycle.id, due_at: nextDue })
    .select("id")
    .single();
  if (error || !app) return null;
  await insertItems(supabase, userId, app.id, items);
  return app.id;
}

/**
 * Moves a still-shortlisted application to another intake of the same course (J5.7): the course's checklist is
 * rebuilt for that intake, and the student's own items are kept. An application being prepared never moves.
 */
export async function moveToIntake(supabase: Supabase, userId: string, applicationId: string, programId: string, cycleId: string): Promise<boolean> {
  const card = await loadCard(supabase, programId);
  const cycle = await loadCycleById(supabase, cycleId);
  if (!card || !cycle || cycle.program_id !== programId) return false;
  const { items, nextDue } = await checklistFor(supabase, userId, card, cycle);
  const { data: moved } = await supabase
    .from("applications")
    .update({ cycle_id: cycle.id, due_at: nextDue })
    .eq("id", applicationId)
    .eq("status", "shortlisted")
    .select("id")
    .maybeSingle();
  if (!moved) return false;
  await supabase.from("checklist_items").delete().eq("application_id", applicationId).neq("kind", "custom");
  await insertItems(supabase, userId, applicationId, items);
  return true;
}
