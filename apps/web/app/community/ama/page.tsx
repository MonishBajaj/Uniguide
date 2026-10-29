import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { amaPhase, amaWhen } from "@/lib/ama";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ask me anything", description: "Seasonal question sessions with admissions staff, visa advisers and alumni." };

export default async function Amas() {
  if (!COMMUNITY_ENABLED) notFound();
  const supabase = await createClient();
  const { data: amas } = await supabase.from("community_amas").select("id, title, host_name, host_role, topic, starts_at, ends_at").eq("published", true).order("starts_at", { ascending: false });
  const upcoming = (amas ?? []).filter((a) => amaPhase(a) !== "past").reverse();
  const past = (amas ?? []).filter((a) => amaPhase(a) === "past");
  const Item = ({ a }: { a: (typeof upcoming)[number] }) => (
    <li className="grid gap-1 rounded-2xl border border-border bg-surface p-5">
      <Link href={`/community/ama/${a.id}`} className="text-lg font-semibold underline-offset-2 hover:underline">{a.title}</Link>
      <p className="text-sm text-muted">{a.host_name}{a.host_role ? `, ${a.host_role}` : ""} · {amaWhen(a)}{amaPhase(a) === "live" ? " · happening now" : ""}</p>
      {a.topic ? <p className="text-sm">{a.topic}</p> : null}
    </li>
  );
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16">
      <header className="grid gap-2">
        <Link href="/community" className="text-sm text-muted underline underline-offset-2">Community</Link>
        <h1 className="text-4xl font-semibold">Ask me anything</h1>
        <p className="text-muted">
          Seasonal sessions with admissions staff, visa advisers and alumni. Send questions before or during the session;
          a moderator passes them to the host, and the answers stay here afterwards.
        </p>
      </header>
      <section aria-labelledby="upcoming" className="grid gap-3">
        <h2 id="upcoming" className="text-2xl font-semibold">Coming up</h2>
        {upcoming.length ? <ul className="grid gap-3">{upcoming.map((a) => <Item key={a.id} a={a} />)}</ul> : <p className="text-muted">Nothing scheduled yet.</p>}
      </section>
      {past.length ? (
        <section aria-labelledby="past" className="grid gap-3">
          <h2 id="past" className="text-2xl font-semibold">Past sessions</h2>
          <ul className="grid gap-3">{past.map((a) => <Item key={a.id} a={a} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}
