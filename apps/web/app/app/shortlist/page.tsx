import type { Metadata } from "next";
import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { loadCurrentCycles } from "@/lib/catalog";
import { daysUntil, deadlineText } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { removeFromShortlist } from "./actions";
import { MergeLocalShortlist } from "./merge-local";

export const metadata: Metadata = { title: "Shortlist" };

export default async function ShortlistPage() {
  const { supabase } = await getUser();
  const { data: rows } = await supabase.from("shortlists").select("program_id").order("created_at");
  const ids = (rows ?? []).map((r) => r.program_id);
  const { data: cards } = ids.length
    ? await supabase.from("program_cards").select("*").in("id", ids)
    : { data: [] };
  const cycles = await loadCurrentCycles(supabase, ids);

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-4xl font-semibold">Shortlist</h1>
        <p className="mt-2 text-muted">Courses you shortlist move up our checking queue, so their facts get verified first.</p>
      </header>
      <MergeLocalShortlist />
      {(cards ?? []).length === 0 ? (
        <div className="rounded-2xl bg-surface p-8">
          <h2 className="text-xl font-semibold">Nothing shortlisted yet</h2>
          <p className="mt-2 text-muted">Add courses from your matches or from search.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/app/match" className="btn btn-primary">See my matches</Link>
            <Link href="/courses" className="btn btn-secondary">Search courses</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards!.map((card) => {
            const upcoming = cycles
              .get(card.id!)
              ?.deadlines.filter((d) => new Date(d.due_at) >= new Date())
              .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
            return (
              <div key={card.id} className="grid gap-2">
                <ProgramCard card={card} signedIn showShortlist={false}>
                  <p className="text-sm">
                    {upcoming
                      ? `Next deadline: ${deadlineText(upcoming.due_at, upcoming.timezone, upcoming.precision)} (${daysUntil(upcoming.due_at)} days)`
                      : "No upcoming deadline known yet"}
                  </p>
                </ProgramCard>
                <form action={removeFromShortlist.bind(null, card.id!)}>
                  <button className="btn btn-secondary btn-sm">Remove</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
