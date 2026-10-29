import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMMUNITY_RULES } from "@/lib/community";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { label, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { withdrawPost } from "./actions";

export const metadata: Metadata = { title: "Community", description: "Stories, reviews and answers from students and alumni, read by a moderator before they appear." };

const STATUS: Record<string, string> = {
  pending: "Waiting for a moderator",
  published: "Published",
  rejected: "Not published",
  removed: "Removed",
};

export default async function CommunityPage() {
  if (!COMMUNITY_ENABLED) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: mine } = user ? await supabase.rpc("my_community_posts") : { data: null };

  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Community</h1>
        <p className="text-muted">
          Experiences from students who have applied and alumni who have studied there. Every post is read by a
          moderator before it appears, and nobody&apos;s real name or contact details are shown.
        </p>
      </header>

      <section aria-labelledby="rules" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="rules" className="text-xl font-semibold">How it works</h2>
        <ul className="grid list-disc gap-1 pl-5 text-sm">{COMMUNITY_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="text-sm text-muted">Posting needs an account and is open to adults only.</p>
      </section>

      <nav aria-label="Community sections" className="grid gap-3 sm:grid-cols-2">
        <Link href="/community/stories" className="grid gap-1 rounded-2xl border border-border bg-surface p-5 hover:bg-surface-2">
          <span className="font-semibold">Application stories</span>
          <span className="text-sm text-muted">How other students applied, and what they would change.</span>
        </Link>
        <Link href="/community/ama" className="grid gap-1 rounded-2xl border border-border bg-surface p-5 hover:bg-surface-2">
          <span className="font-semibold">Ask me anything</span>
          <span className="text-sm text-muted">Seasonal sessions with admissions staff, visa advisers and alumni.</span>
        </Link>
      </nav>

      {mine?.length ? (
        <section aria-labelledby="mine" className="grid gap-3">
          <h2 id="mine" className="text-xl font-semibold">Your posts</h2>
          <ul className="grid gap-2">
            {mine.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
                <div className="grid gap-1">
                  <span className="font-semibold">{p.title ?? `${label(p.kind)}: ${p.body.slice(0, 60)}${p.body.length > 60 ? "…" : ""}`}</span>
                  <span className="text-muted">{STATUS[p.status]} · {shortDate(p.created_at)}{p.moderation_note ? ` · ${p.moderation_note}` : ""}</span>
                </div>
                <form action={withdrawPost.bind(null, p.id)}>
                  <button className="btn btn-secondary btn-sm">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
