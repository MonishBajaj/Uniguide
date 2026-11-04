import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { STORY_QUESTIONS } from "@/lib/writing/prompts";
import { StoryAnswer } from "./story-answer";
import { BookOpen, ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Story bank" };

export default async function StoriesPage() {
  const { supabase } = await getUser();
  const { data } = await supabase.from("story_answers").select("question_id, answer");
  const answers = new Map((data ?? []).map((a) => [a.question_id, a.answer]));
  const groups = [...new Set(STORY_QUESTIONS.map((q) => q.group))];
  return (
    <div className="grid gap-8 max-w-4xl mx-auto">
      <div>
        <Link href="/app/writing" className="text-xs font-bold text-muted hover:text-primary inline-flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Writing Studio</span>
        </Link>
        <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Personal Evidence Bank</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Story Bank</h1>
          <p className="mt-2 text-xs text-muted max-w-2xl leading-relaxed">
            Private, unpolished reflections in your own words. Specific names, metrics, decisions, and dates here become the authentic bedrock of every personal statement.
          </p>
        </header>
      </div>

      {groups.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`} className="grid gap-4">
          <h2 id={`g-${g}`} className="font-serif text-2xl font-bold text-primary">{g}</h2>
          {STORY_QUESTIONS.filter((q) => q.group === g).map((q) => (
            <StoryAnswer key={q.id} id={q.id} question={q.question} hint={q.hint} initial={answers.get(q.id) ?? ""} />
          ))}
        </section>
      ))}
    </div>
  );
}
