import type { Metadata } from "next";
import { shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { grantShare, revokeShare } from "./actions";

export const metadata: Metadata = { title: "Share with a counselor" };

export default async function SharingPage({ searchParams }: PageProps<"/app/sharing">) {
  const { message } = (await searchParams) as { message?: string };
  const { supabase } = await getUser();
  // RLS limits this to the student's own shares and the organisations named in them.
  const { data: shares } = await supabase
    .from("agency_shares")
    .select("id, granted_at, revoked_at, organizations(name)")
    .order("granted_at", { ascending: false });

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Share with a counselor</h1>
        <p className="text-muted">
          If you work with a consultancy, you can let its counselors see your profile, test scores, shortlist and
          application tracker. They cannot change anything, and they never see your writing drafts. You can stop at any
          time and their access ends at once.
        </p>
      </header>
      {message ? <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">{message}</p> : null}

      <form action={grantShare} className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <label className="grid gap-2 text-sm font-semibold">
          Invite code from your consultancy
          <input name="code" required maxLength={40} autoComplete="off" className="field font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Your name as your counselor knows it
          <input name="name" required maxLength={120} className="field font-normal" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" required className="mt-1 accent-[var(--accent)]" />
          I agree to share my profile, scores, shortlist and applications with this organisation until I stop sharing.
        </label>
        <button className="btn btn-primary justify-self-start">Share</button>
      </form>

      <section aria-labelledby="shares" className="grid gap-3">
        <h2 id="shares" className="text-2xl font-semibold">Who can see your plans</h2>
        {(shares ?? []).length === 0 ? <p className="text-muted">Nobody. Your plans are private to you.</p> : null}
        <ul className="grid gap-2">
          {(shares ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <span>
                <span className="font-semibold">{s.organizations?.name}</span>
                <span className="block text-muted">
                  Since {shortDate(s.granted_at)}{s.revoked_at ? `, stopped ${shortDate(s.revoked_at)}` : ""}
                </span>
              </span>
              {s.revoked_at ? null : (
                <form action={revokeShare.bind(null, s.id)}>
                  <button className="btn btn-secondary btn-sm">Stop sharing</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
