import type { Metadata } from "next";
import Link from "next/link";
import { label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { PenTool, BookOpen, FileText, Plus, Sparkles, FolderArchive } from "lucide-react";

export const metadata: Metadata = { title: "Writing" };

export default async function WritingPage() {
  const { supabase } = await getUser();
  const [{ data: docs }, { data: allowance }] = await Promise.all([
    supabase.from("documents").select("id, title, kind, word_limit, updated_at, document_versions(word_count, created_at)").order("updated_at", { ascending: false }),
    supabase.rpc("writing_allowance").single(),
  ]);

  return (
    <div className="grid gap-8 max-w-4xl mx-auto">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PenTool className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">SOP & Essay Workshop</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Writing Coach</h1>
            <p className="mt-2 text-sm text-muted max-w-xl leading-relaxed">
              Constructive feedback on your statements that comments, asks questions and quotes your own sentences. It never writes for you, and draft revisions are tracked.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:self-start">
            <Link href="/app/writing/new" className="btn btn-coral-bright btn-sm gap-1.5 shadow-xs whitespace-nowrap">
              <Plus className="h-4 w-4" />
              <span>New Document</span>
            </Link>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border/60 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Link href="/app/writing/stories" className="btn btn-secondary btn-sm gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Story Bank</span>
            </Link>
            <Link href="/app/cv" className="btn btn-secondary btn-sm gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span>Academic CV</span>
            </Link>
            <Link href="/app/portfolio" className="btn btn-secondary btn-sm gap-1.5">
              <FolderArchive className="h-3.5 w-3.5" />
              <span>Portfolio</span>
            </Link>
          </div>

          <span className="rounded-full bg-surface-2 px-3 py-1 font-medium text-muted border border-border/60">
            {allowance?.free_review ? "Your first full review is free" : `Review credits: ${allowance?.balance ?? 0}`}
          </span>
        </div>
      </header>

      {(docs ?? []).length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-14">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-primary">Start with your stories</h2>
          <p className="mt-2 text-sm text-muted max-w-md mx-auto leading-relaxed">
            Answer a few questions in the story bank first; your most authentic personal material is usually found there, not staring at a blank page.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app/writing/stories" className="btn btn-coral-bright shadow-sm">Open Story Bank</Link>
            <Link href="/app/writing/new" className="btn btn-secondary">Create New Document</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {docs!.map((d) => {
            const latest = [...d.document_versions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            return (
              <div
                key={d.id}
                className="group rounded-xl border border-border bg-surface p-6 ambient-shadow hover:border-primary/40 transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-primary border border-border/60">
                      {label(d.kind)}
                    </span>
                    <span className="text-[11px] text-muted">Edited {shortDate(d.updated_at)}</span>
                  </div>
                  <Link
                    href={`/app/writing/${d.id}`}
                    className="font-serif text-lg font-bold text-primary hover:text-secondary hover:underline line-clamp-1"
                  >
                    {d.title}
                  </Link>
                </div>

                <div className="flex items-center justify-between text-xs text-muted pt-3 border-t border-border/60">
                  <span>
                    {d.document_versions.length} {d.document_versions.length === 1 ? "draft" : "drafts"}
                    {latest ? ` · ${latest.word_count}${d.word_limit ? ` / ${d.word_limit}` : ""} words` : ""}
                  </span>
                  <Link
                    href={`/app/writing/${d.id}`}
                    className="font-semibold text-primary hover:text-secondary inline-flex items-center gap-1"
                  >
                    <span>Open</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
