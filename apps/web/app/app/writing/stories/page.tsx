import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { STORY_QUESTIONS } from "@/lib/writing/prompts";
import { StoryAnswer } from "./story-answer";

export const metadata: Metadata = { title: "Story bank" };

export default async function StoriesPage() {
  const { supabase } = await getUser();
  const { data } = await supabase.from("story_answers").select("question_id, answer");
  const answers = new Map((data ?? []).map((a) => [a.question_id, a.answer]));
  const groups = [...new Set(STORY_QUESTIONS.map((q) => q.group))];
  return (
    <div className="grid gap-8">
      <header>
        <Link href="/app/writing" className="text-sm text-muted underline underline-offset-2">Writing</Link>
        <h1 className="mt-2 text-4xl font-semibold">Story bank</h1>
        <p className="mt-2 max-w-[680px] text-muted">Private notes, in your own words. Short answers with names, numbers and dates are the raw material for every statement.</p>
      </header>
      {groups.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`} className="grid gap-4">
          <h2 id={`g-${g}`} className="text-2xl font-semibold">{g}</h2>
          {STORY_QUESTIONS.filter((q) => q.group === g).map((q) => (
            <StoryAnswer key={q.id} id={q.id} question={q.question} hint={q.hint} initial={answers.get(q.id) ?? ""} />
          ))}
        </section>
      ))}
    </div>
  );
}
