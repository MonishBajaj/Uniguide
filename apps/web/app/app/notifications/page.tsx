import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { localizeJourney } from "@/lib/journey-copy";
import { getJourney } from "@/lib/journey-request.server";

export const metadata: Metadata = { title: "Updates" };

async function markAllRead() {
  "use server";
  const { supabase } = await getUser();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/app", "layout");
}

/** An ISO timestamp `days` ago, for comparing with stored timestamps. */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export default async function NotificationsPage() {
  const { supabase, user } = await getUser();
  const { t, locale } = await getLocale();
  const u = t.journey.updates;
  const [{ data }, { data: stageEvents }] = await Promise.all([
    supabase.from("notifications").select("*, programs(slug, title)").order("created_at", { ascending: false }).limit(100),
    supabase.from("journey_events").select("id, stage, created_at").eq("user_id", user!.id).eq("kind", "stage_entered").order("created_at"),
  ]);
  const since = daysAgo(90);
  // Journey events (G24, J4.4): stage changes from the last 90 days, newest first, and the steps due soon.
  // The first stage event is where the journey started, not a stage the student reached.
  const stages = (stageEvents ?? [])
    .map((e, i) => ({ ...e, first: i === 0 }))
    .filter((e) => e.created_at >= since)
    .reverse();
  let urgent: { id: string; title: string; href: string }[] = [];
  try {
    urgent = localizeJourney((await getJourney()).result, locale).steps.filter((s) => s.rank === "urgent");
  } catch {
    // The page still lists course updates when the journey can't be read.
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Updates</h1>
          <p className="mt-2 text-muted">Changes to courses you shortlisted, reminders and replies to your reports.</p>
        </div>
        {(data ?? []).some((n) => !n.read_at) ? (
          <form action={markAllRead}><button className="btn btn-secondary btn-sm">Mark all as read</button></form>
        ) : null}
      </header>
      {stages.length || urgent.length ? (
        <section aria-labelledby="journey-updates" className="grid gap-3">
          <h2 id="journey-updates" className="text-2xl font-semibold">{u.title}</h2>
          {urgent.length ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-semibold">{u.dueSoon}</p>
              <ul className="mt-1 grid gap-1">
                {urgent.map((s) => (
                  <li key={s.id}><Link href={s.href} className="underline underline-offset-2">{s.title}</Link></li>
                ))}
              </ul>
              <Link href="/app/steps" className="mt-2 inline-block text-sm underline underline-offset-2">{u.allSteps}</Link>
            </div>
          ) : null}
          {stages.length ? (
            <ul className="grid gap-2">
              {stages.map((e) => {
                const name = t.journey.stages[String(e.stage) as keyof typeof t.journey.stages].name;
                return (
                  <li key={e.id} className="rounded-2xl border border-border bg-surface p-4">
                    <p className="text-sm text-muted">{shortDate(e.created_at)}</p>
                    <p className="mt-1 font-semibold">{e.first ? u.started(e.stage!, name) : u.reached(e.stage!, name)}</p>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {(data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">Nothing new</h2>
          <p className="mt-2 text-muted">When an official page changes a fact on a course you shortlisted, you will see it here and by email.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {data!.map((n) => (
            <li key={n.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                {!n.read_at ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">New</span> : null}
                {shortDate(n.created_at)}
              </p>
              <p className="mt-1 font-semibold">{n.title}</p>
              {n.body ? <p className="mt-1 text-muted">{n.body}</p> : null}
              {n.programs ? (
                <Link href={`/courses/${n.programs.slug}`} className="mt-2 inline-block text-sm underline underline-offset-2">{n.programs.title}</Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
