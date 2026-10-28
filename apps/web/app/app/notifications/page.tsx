import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Updates" };

async function markAllRead() {
  "use server";
  const { supabase } = await getUser();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/app", "layout");
}

export default async function NotificationsPage() {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("notifications")
    .select("*, programs(slug, title)")
    .order("created_at", { ascending: false })
    .limit(100);

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
      {(data ?? []).length === 0 ? (
        <div className="rounded-2xl bg-surface p-8">
          <h2 className="text-xl font-semibold">Nothing new</h2>
          <p className="mt-2 text-muted">When an official page changes a fact on a course you shortlisted, you will see it here and by email.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {data!.map((n) => (
            <li key={n.id} className="rounded-2xl bg-surface p-4">
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
