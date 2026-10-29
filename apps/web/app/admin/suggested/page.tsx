import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { countryName, label } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { reviewSuggestion } from "./actions";

export const metadata: Metadata = { title: "Suggested courses" };

export default async function SuggestedAdmin() {
  const { supabase, user } = await getUser();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!admin) notFound();
  const { data: courses } = await supabase
    .from("programs")
    .select("id, title, level, official_url, created_at, institutions(name, country, official_domain)")
    .eq("suggestion_status", "pending")
    .order("created_at");

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12">
      <header>
        <h1 className="text-4xl font-semibold">Suggested courses</h1>
        <p className="mt-2 max-w-2xl text-muted">
          The model suggested these courses and their official pages. They stay hidden from students until you approve them. Open each page, check it
          is the university&apos;s own page for that course, then approve or reject.
        </p>
      </header>

      {(courses ?? []).length === 0 ? (
        <p className="text-muted">Nothing is waiting for review.</p>
      ) : (
        <ul className="grid gap-3">
          {(courses ?? []).map((c) => (
            <li key={c.id} aria-label={c.title} className="grid gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <div>
                <p className="font-semibold">{c.title}</p>
                <p className="text-muted">
                  {c.institutions?.name} · {c.institutions ? countryName(c.institutions.country) : ""} · {label(c.level)}
                </p>
                {c.official_url ? (
                  <p>
                    <a href={c.official_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {c.official_url}
                    </a>
                    <span className="text-muted"> · expected domain {c.institutions?.official_domain ?? "unknown"}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <form action={reviewSuggestion.bind(null, c.id, true)}><button className="btn btn-primary btn-sm">Approve</button></form>
                <form action={reviewSuggestion.bind(null, c.id, false)}><button className="btn btn-secondary btn-sm">Reject</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
