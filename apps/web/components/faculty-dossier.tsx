import type { ProgramCard } from "@/lib/catalog";
import { loadFaculty } from "@/lib/faculty";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const QUESTIONS = [
  "Which of these papers asks a question close to the one you want to work on?",
  "What would you want to ask this researcher, and why could only they answer it?",
  "What have you done that would be useful to their group?",
];

/** Facts about researchers and their recent work. The student writes the "why this university" sentences. */
export async function FacultyDossier({ supabase, card, interests }: { supabase: Supabase; card: ProgramCard; interests: string | null }) {
  if (card.level !== "master" && card.level !== "doctorate") return null;
  const data = await loadFaculty(supabase, card, interests);
  if (!data.length) return null;

  return (
    <section aria-labelledby="faculty" className="mt-12">
      <h2 id="faculty" className="text-2xl font-semibold">Researchers at {card.institution_name}</h2>
      <p className="mt-2 text-sm text-muted">
        {interests ? "Ordered by closeness to the research interests on your profile. " : "Add research interests to your profile to order these by fit. "}
        From OpenAlex. Check each person still works there before you mention them.
      </p>
      <ul className="mt-4 grid gap-3">
        {data.map((f) => (
          <li key={f.id} className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <a href={f.openalex_id} target="_blank" rel="noreferrer" className="text-base font-semibold underline-offset-2 hover:underline">{f.name}</a>
            <p className="mt-1 text-muted">{f.topics.slice(0, 4).map((t) => t.name).join(" · ")}</p>
            <ul className="mt-2 grid gap-1">
              {f.recent_works.slice(0, 3).map((w) => (
                <li key={w.openalex_id}>
                  {w.doi ? <a href={w.doi} target="_blank" rel="noreferrer" className="underline underline-offset-2">{w.title}</a> : w.title} ({w.year})
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p className="font-semibold">Questions for your &ldquo;why this university&rdquo; answer</p>
        <ul className="mt-2 list-disc pl-5 text-muted">{QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ul>
      </div>
    </section>
  );
}
