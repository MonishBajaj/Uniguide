import "server-only";
import { embedQuery, ISCED_TO_OPENALEX } from "@/lib/embeddings";
import type { ProgramCard } from "@/lib/catalog";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type FacultyTopic = { name: string; field: string };
export type FacultyWork = { title: string; year: number; doi: string | null; openalex_id: string };

/** Researchers at a course's university, ordered by closeness to the student's interests when given. */
export async function loadFaculty(supabase: Supabase, card: ProgramCard, interests: string | null, limit = 8) {
  const embedding = interests ? await embedQuery(interests) : null;
  const { data } = await supabase.rpc("match_faculty", {
    p_institution_id: card.institution_id!,
    p_query: interests ?? undefined,
    p_fields: ISCED_TO_OPENALEX[(card.isced_f ?? "").slice(0, 2)] ?? undefined,
    p_query_embedding: embedding ? JSON.stringify(embedding) : undefined,
    p_limit: limit,
  });
  return (data ?? []).map((f) => ({ ...f, topics: f.topics as FacultyTopic[], recent_works: f.recent_works as FacultyWork[] }));
}
