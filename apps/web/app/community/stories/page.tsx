import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityPost } from "@/components/community-post";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { countryName, DESTINATIONS, label, LEVELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Application stories", description: "How other students applied abroad: what worked, what they would change. Read by a moderator before publishing." };

export default async function Stories({ searchParams }: PageProps<"/community/stories">) {
  if (!COMMUNITY_ENABLED) notFound();
  const params = await searchParams;
  const country = typeof params.country === "string" && (DESTINATIONS as readonly string[]).includes(params.country) ? params.country : null;
  const level = typeof params.level === "string" && (LEVELS as readonly string[]).includes(params.level) ? (params.level as (typeof LEVELS)[number]) : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let query = supabase.from("community_posts").select("id, pseudonym, badge, title, body, country, level, created_at").eq("kind", "story").eq("status", "published").order("created_at", { ascending: false }).limit(50);
  if (country) query = query.eq("country", country);
  if (level) query = query.eq("level", level);
  const { data: stories } = await query;

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-6 py-16">
      <header className="grid gap-2">
        <Link href="/community" className="text-sm text-muted underline underline-offset-2">Community</Link>
        <h1 className="text-4xl font-semibold">Application stories</h1>
        <p className="text-muted">First-hand accounts from students who have applied. Each one is a single experience; check facts on the official pages.</p>
        <Link href="/community/stories/new" className="btn btn-primary mt-2 justify-self-start">Share your story</Link>
      </header>

      <form className="flex flex-wrap items-end gap-3 text-sm" aria-label="Filter stories">
        <label className="grid gap-1">
          Destination
          <select name="country" defaultValue={country ?? ""} className="field">
            <option value="">Any</option>
            {DESTINATIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          Level
          <select name="level" defaultValue={level ?? ""} className="field">
            <option value="">Any</option>
            {LEVELS.map((l) => <option key={l} value={l}>{label(l)}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary btn-sm">Filter</button>
      </form>

      {(stories ?? []).length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-muted">No stories here yet. Be the first to share yours.</p>
      ) : (
        <div className="grid gap-4">
          {stories!.map((s) => (
            <CommunityPost key={s.id} post={s} signedIn={Boolean(user)} headingLevel={2}>
              {s.country || s.level ? (
                <p className="text-xs text-muted">{[s.country ? countryName(s.country) : null, s.level ? label(s.level) : null].filter(Boolean).join(" · ")}</p>
              ) : null}
            </CommunityPost>
          ))}
        </div>
      )}
    </div>
  );
}
