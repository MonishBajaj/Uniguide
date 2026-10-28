"use server";

import { aiBlocked, logRun } from "@/lib/ai-usage";
import { answerAboutCourse } from "@/lib/assistant";
import { loadCurrentCycles } from "@/lib/catalog";
import { deadlineText, label, money } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

export type Cited = { text: string; citations: { status: string; source: { url: string; owner: string } | null }[] };
export type AskResult = { ok: boolean; message?: string; sentences?: Cited[]; answered?: boolean; officialUrl?: string | null };

/** Answers from this course's published facts only; every claim links to the fact it came from. */
export async function askAboutCourse(programId: string, question: string): Promise<AskResult> {
  const q = question.trim().slice(0, 500);
  if (q.length < 5) return { ok: false, message: "Ask a full question." };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in to ask questions." };
  const blocked = await aiBlocked(supabase);
  if (blocked) return { ok: false, message: blocked };
  const [{ data: card }, cycles] = await Promise.all([
    supabase.from("program_cards").select("official_url").eq("id", programId).single(),
    loadCurrentCycles(supabase, [programId]),
  ]);
  const cycle = cycles.get(programId);
  const facts: { id: string; text: string; status: string; source: { url: string; owner: string } | null }[] = [];
  for (const d of cycle?.deadlines ?? []) {
    facts.push({ id: `F${facts.length + 1}`, text: `${label(d.kind)} deadline${d.applicant_category !== "all" ? ` (${label(d.applicant_category)})` : ""}: ${deadlineText(d.due_at, d.timezone, d.precision)}${d.owning_system !== "direct" ? `, via ${label(d.owning_system)}` : ""}`, status: d.status, source: d.sources });
  }
  for (const r of cycle?.requirements ?? []) {
    const what = r.kind === "language_test" ? `${label(r.exam)} minimum ${r.min_total ?? "not stated"}` : r.kind === "admissions_test" ? `${label(r.exam)} ${label(r.test_policy)}` : `${label(r.qualification ?? r.kind)} ${r.min_grade_text ?? r.details ?? ""}`;
    facts.push({ id: `F${facts.length + 1}`, text: `Requirement${r.applicant_category !== "all" ? ` (${label(r.applicant_category)})` : ""}: ${what}`, status: r.status, source: r.sources });
  }
  for (const c of cycle?.cost_items ?? []) {
    facts.push({ id: `F${facts.length + 1}`, text: `${label(c.kind)}${c.applicant_category !== "all" ? ` (${label(c.applicant_category)})` : ""}: ${money(Number(c.base), c.currency)} ${label(c.basis)}${c.fee_year ? ` (${c.fee_year})` : ""}`, status: c.status, source: c.sources });
  }
  if (facts.length === 0) {
    return { ok: true, answered: false, sentences: [], officialUrl: card?.official_url ?? null };
  }

  let run;
  try {
    run = await answerAboutCourse(q, facts);
  } catch {
    return { ok: false, message: "Questions are unavailable right now." };
  }
  await logRun(supabase, user.id, "course_question", run);
  if (!run.parsed) return { ok: false, message: "We could not answer that from the published facts." };
  const byId = new Map(facts.map((f) => [f.id, f]));
  return {
    ok: true,
    answered: run.parsed.answered,
    officialUrl: card?.official_url ?? null,
    sentences: run.parsed.sentences.map((s) => ({
      text: s.text,
      citations: s.fact_ids.map((id) => ({ status: byId.get(id)!.status, source: byId.get(id)!.source })),
    })),
  };
}
