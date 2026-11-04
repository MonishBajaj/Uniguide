import type { Metadata } from "next";
import Link from "next/link";
import { bulletHints, CV_SECTIONS, dateRange, orderEntries, type CvSection } from "@/lib/cv";
import { getUser } from "@/lib/supabase/server";
import { addEntry, removeEntry, saveHeader, updateEntry } from "./actions";
import { EntryForm } from "./entry-form";
import { FileText, Printer, Plus, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "CV" };

export default async function CvPage() {
  const { supabase, user } = await getUser();
  const [{ data: header }, { data: entries }] = await Promise.all([
    supabase.from("cv_headers").select("*").eq("user_id", user!.id).maybeSingle(),
    supabase.from("cv_entries").select("*"),
  ]);
  const ordered = orderEntries(entries ?? []);
  const flagged = ordered.reduce((n, e) => n + e.bullets.filter((b) => bulletHints(b, e.section).length).length, 0);

  return (
    <div className="grid gap-8 max-w-4xl mx-auto">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Academic CV Builder</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Academic Resume & CV</h1>
            <p className="mt-2 text-sm text-muted max-w-xl leading-relaxed">
              Your academic background, research, publications, and professional experience formatted for international admissions.
            </p>
          </div>

          {ordered.length && header ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/cv/print?template=classic" className="btn btn-coral-bright btn-sm gap-1.5 shadow-xs whitespace-nowrap">
                <Printer className="h-4 w-4" />
                <span>Print or Export PDF</span>
              </Link>
              <Link href="/app/cv/print?template=compact" className="btn btn-secondary btn-sm whitespace-nowrap">
                Compact Layout
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      {/* Header Info Form */}
      <form action={saveHeader} className="grid gap-4 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow sm:grid-cols-3">
        <h2 className="text-lg font-serif font-bold text-primary sm:col-span-3 border-b border-border/60 pb-3">Personal & Contact Info</h2>
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          Full name
          <input name="full_name" required maxLength={120} defaultValue={header?.full_name ?? ""} className="field text-sm" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          Headline
          <input name="headline" maxLength={160} defaultValue={header?.headline ?? ""} placeholder="e.g. CS Graduate, ML Researcher" className="field text-sm" />
        </label>
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          Contact details
          <input name="contact_line" maxLength={240} defaultValue={header?.contact_line ?? ""} placeholder="alex@stanford.edu · +1 (555) 0192" className="field text-sm" />
        </label>
        <div className="sm:col-span-3 flex justify-end pt-2">
          <button className="btn btn-secondary btn-sm">Save Contact Info</button>
        </div>
      </form>

      {/* Entries List */}
      {ordered.length ? (
        <section aria-labelledby="entries" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="entries" className="text-2xl font-serif font-bold text-primary">CV Entries ({ordered.length})</h2>
            <p className="text-xs text-muted font-medium">
              {flagged ? `${flagged} bullet points can be strengthened with metrics` : "All bullet points look strong"}
            </p>
          </div>

          <div className="grid gap-4">
            {ordered.map((e) => (
              <article key={e.id} aria-label={e.title} className="rounded-xl border border-border bg-surface p-6 ambient-shadow grid gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
                  <div>
                    <span className="text-[11px] font-bold tracking-wider text-secondary uppercase bg-secondary/10 px-2 py-0.5 rounded-full inline-block mb-1">
                      {CV_SECTIONS[e.section as CvSection]}
                    </span>
                    <h3 className="font-serif text-lg font-bold text-primary">
                      {e.title}
                      {e.organisation ? <span className="font-sans font-normal text-muted text-sm"> · {e.organisation}</span> : null}
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-muted">
                    {[e.location, dateRange(e.start_month, e.end_month)].filter(Boolean).join(" · ")}
                  </span>
                </div>

                <ul className="grid gap-2 text-sm text-foreground list-disc pl-5">
                  {e.bullets.map((b, i) => {
                    const hints = bulletHints(b, e.section);
                    return (
                      <li key={i} className="leading-relaxed">
                        <span>{b}</span>
                        {hints.length ? (
                          <div className="mt-1 text-xs text-unverified bg-[#ffdad3]/30 p-2 rounded-lg border border-[#ffb4a4]/40 font-sans">
                            {hints.join("; ")}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <form action={removeEntry.bind(null, e.id)}>
                    <button className="text-xs text-conflicting hover:underline">Remove entry</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* Add New Entry Form */}
      <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <h2 className="text-xl font-serif font-bold text-primary mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-secondary" />
          <span>Add New Entry</span>
        </h2>
        <EntryForm action={addEntry} submit="Add entry" idPrefix="new" />
      </section>
    </div>
  );
}
