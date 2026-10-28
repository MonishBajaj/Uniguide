import type { Metadata } from "next";
import Link from "next/link";
import { bulletHints, CV_SECTIONS, dateRange, orderEntries, type CvSection } from "@/lib/cv";
import { getUser } from "@/lib/supabase/server";
import { addEntry, removeEntry, saveHeader, updateEntry } from "./actions";
import { EntryForm } from "./entry-form";

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
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Your CV</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Your own entries, laid out cleanly. Under each point we ask what a reader would want to know; we never rewrite it.
          </p>
        </div>
        {ordered.length && header ? (
          <div className="flex gap-2">
            <Link href="/app/cv/print?template=classic" className="btn btn-primary btn-sm">Print or save as PDF</Link>
            <Link href="/app/cv/print?template=compact" className="btn btn-secondary btn-sm">Compact layout</Link>
          </div>
        ) : null}
      </header>

      <form action={saveHeader} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3">
        <h2 className="text-lg font-semibold sm:col-span-3">At the top</h2>
        <label className="grid gap-1 text-sm">Full name<input name="full_name" required maxLength={120} defaultValue={header?.full_name ?? ""} className="field" /></label>
        <label className="grid gap-1 text-sm">One line about you (optional)<input name="headline" maxLength={160} defaultValue={header?.headline ?? ""} placeholder="For example: Computer science graduate, data analyst" className="field" /></label>
        <label className="grid gap-1 text-sm">Contact line (optional)<input name="contact_line" maxLength={240} defaultValue={header?.contact_line ?? ""} placeholder="Email · phone · city" className="field" /></label>
        <button className="btn btn-secondary justify-self-start">Save</button>
      </form>

      {ordered.length ? (
        <section aria-labelledby="entries" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="entries" className="text-2xl font-semibold">Entries</h2>
            <p className="text-sm text-muted">{flagged ? `${flagged} point${flagged === 1 ? "" : "s"} with a question below` : "No questions on your points"}</p>
          </div>
          {ordered.map((e) => (
            <article key={e.id} aria-label={e.title} className="grid gap-2 rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{CV_SECTIONS[e.section as CvSection]}</p>
                  <h3 className="font-semibold">{e.title}{e.organisation ? <span className="font-normal text-muted"> · {e.organisation}</span> : null}</h3>
                </div>
                <p className="text-sm text-muted">{[e.location, dateRange(e.start_month, e.end_month)].filter(Boolean).join(" · ")}</p>
              </div>
              <ul className="grid gap-2 text-sm">
                {e.bullets.map((b, i) => {
                  const hints = bulletHints(b, e.section);
                  return (
                    <li key={i}>
                      <span>• {b}</span>
                      {hints.map((h) => <span key={h} className="block pl-3 text-unverified">{h}</span>)}
                    </li>
                  );
                })}
              </ul>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Edit</summary>
                <div className="mt-3 grid gap-3">
                  <EntryForm action={updateEntry.bind(null, e.id)} entry={e} submit="Save changes" idPrefix={`e-${e.id}`} />
                  <form action={removeEntry.bind(null, e.id)}>
                    <button className="btn btn-secondary btn-sm">Remove this entry</button>
                  </form>
                </div>
              </details>
            </article>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="add" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="add" className="text-lg font-semibold">Add an entry</h2>
        <EntryForm action={addEntry} submit="Add entry" idPrefix="new" />
      </section>
    </div>
  );
}
