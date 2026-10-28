import type { Metadata } from "next";
import Link from "next/link";
import { label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Writing" };

export default async function WritingPage() {
  const { supabase } = await getUser();
  const [{ data: docs }, { data: allowance }] = await Promise.all([
    supabase.from("documents").select("id, title, kind, word_limit, updated_at, document_versions(word_count, created_at)").order("updated_at", { ascending: false }),
    supabase.rpc("writing_allowance").single(),
  ]);

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Writing</h1>
          <p className="mt-2 max-w-[680px] text-muted">
            Feedback on your statements that comments, asks questions and quotes your own sentences. It never writes them
            for you, and every draft keeps a record of how it was written that you can export.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/writing/stories" className="btn btn-secondary btn-sm">Story bank</Link>
          <Link href="/app/writing/new" className="btn btn-primary btn-sm">New document</Link>
        </div>
      </header>
      <p className="text-sm text-muted">
        {allowance?.free_review ? "Your first full review is free." : `Credits: ${allowance?.balance ?? 0}. A review or a comparison uses 1 credit.`}
      </p>
      {(docs ?? []).length === 0 ? (
        <div className="rounded-2xl bg-surface p-8">
          <h2 className="text-xl font-semibold">Start with your stories</h2>
          <p className="mt-2 text-muted">Answer a few questions in the story bank first; your best material is usually there, not in a blank page.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/app/writing/stories" className="btn btn-primary">Open the story bank</Link>
            <Link href="/app/writing/new" className="btn btn-secondary">New document</Link>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {docs!.map((d) => {
            const latest = [...d.document_versions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            return (
              <li key={d.id} className="rounded-2xl bg-surface p-5">
                <p className="text-sm text-muted">{label(d.kind)}</p>
                <Link href={`/app/writing/${d.id}`} className="text-lg font-semibold underline-offset-2 hover:underline">{d.title}</Link>
                <p className="mt-1 text-sm text-muted">
                  {d.document_versions.length} drafts{latest ? ` · ${latest.word_count}${d.word_limit ? ` / ${d.word_limit}` : ""} words` : ""} · edited {shortDate(d.updated_at)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
