import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMMUNITY_RULES } from "@/lib/community";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { label, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { withdrawPost } from "./actions";
import { Users, BookOpen, MessageCircleQuestion, ShieldCheck, ArrowRight } from "lucide-react";

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
    <div className="mx-auto grid max-w-4xl gap-8 px-6 py-12">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Student & Alumni Network</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Community</h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Authentic experiences from students who have applied and alumni who have studied abroad. Every post is read by a
          moderator before it appears, and personal contact details are strictly kept private.
        </p>
      </header>

      <section aria-labelledby="rules" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow space-y-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <ShieldCheck className="h-5 w-5 text-verified" />
          <h2 id="rules" className="font-serif text-xl font-bold text-primary">Community Standards</h2>
        </div>
        <ul className="grid list-disc gap-2 pl-5 text-xs text-muted leading-relaxed">
          {COMMUNITY_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="text-xs text-muted pt-2 border-t border-border/40">Posting requires a verified account and is open to adults only.</p>
      </section>

      <nav aria-label="Community sections" className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/community/stories"
          className="group rounded-xl border border-border bg-surface p-6 ambient-shadow transition-all hover:bg-surface-2/60 hover:border-secondary/40 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <BookOpen className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-secondary group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="font-serif font-bold text-lg text-primary mb-1">Application Stories</h3>
            <p className="text-xs text-muted leading-relaxed">How other students applied, what their true costs were, and what they would change.</p>
          </div>
        </Link>

        <Link
          href="/community/ama"
          className="group rounded-xl border border-border bg-surface p-6 ambient-shadow transition-all hover:bg-surface-2/60 hover:border-secondary/40 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageCircleQuestion className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-secondary group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="font-serif font-bold text-lg text-primary mb-1">Ask Me Anything</h3>
            <p className="text-xs text-muted leading-relaxed">Seasonal sessions with official admissions staff, visa advisers, and alumni.</p>
          </div>
        </Link>
      </nav>

      {mine?.length ? (
        <section aria-labelledby="mine" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow space-y-4">
          <h2 id="mine" className="font-serif text-xl font-bold text-primary">Your Submissions</h2>
          <ul className="grid gap-3">
            {mine.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border/60 bg-surface-2/40 text-xs">
                <div className="grid gap-1">
                  <span className="font-serif font-bold text-sm text-primary">{p.title ?? `${label(p.kind)}: ${p.body.slice(0, 60)}${p.body.length > 60 ? "…" : ""}`}</span>
                  <span className="text-muted font-mono">{STATUS[p.status]} · {shortDate(p.created_at)}{p.moderation_note ? ` · ${p.moderation_note}` : ""}</span>
                </div>
                <form action={withdrawPost.bind(null, p.id)}>
                  <button className="btn btn-secondary btn-sm text-conflicting hover:bg-conflicting/10">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
