import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { COMMUNITY_RULES } from "@/lib/community";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { StoryForm } from "./story-form";

export const metadata: Metadata = { title: "Share your application story" };

export default async function NewStory() {
  if (!COMMUNITY_ENABLED) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/community/stories/new");
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-6 py-16">
      <header className="grid gap-2">
        <Link href="/community/stories" className="text-sm text-muted underline underline-offset-2">Stories</Link>
        <h1 className="text-4xl font-semibold">Share your application story</h1>
        <p className="text-muted">
          What you applied for, what went well, what you would do differently. Someone a year behind you will read it.
          It appears only after a moderator has read it.
        </p>
      </header>
      <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">{COMMUNITY_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      <StoryForm />
    </div>
  );
}
