import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONTACT_MESSAGES, findContactDetails, REPORT_REASONS } from "@/lib/community";
import { COMMUNITY_ENABLED } from "@/lib/env";
import { label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import Link from "next/link";
import { amaPhase, amaWhen } from "@/lib/ama";
import { createAma, moderatePost, resolveReport, reviewAlum, setAmaPublished } from "./actions";

export const metadata: Metadata = { title: "Community moderation" };

export default async function CommunityAdmin() {
  if (!COMMUNITY_ENABLED) notFound();
  const { supabase, user } = await getUser();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!admin) notFound();
  const [{ data: pending, error: e1 }, { data: reports, error: e2 }, { data: alumni, error: e3 }, { data: amas, error: e4 }] = await Promise.all([
    supabase
      .from("community_posts")
      .select("id, kind, parent_id, pseudonym, title, body, ratings, badge, moderation_note, created_at, programs(title)")
      .eq("status", "pending")
      .order("created_at"),
    supabase.from("community_reports").select("id, reason, note, created_at, community_posts(id, kind, pseudonym, title, body, status)").eq("status", "open").order("created_at"),
    supabase.from("community_alumni").select("id, graduation_year, evidence, created_at, programs(title)").eq("status", "pending").order("created_at"),
    supabase.from("community_amas").select("id, title, host_name, starts_at, ends_at, published").order("starts_at", { ascending: false }).limit(20),
  ]);
  // An empty queue must mean empty, not a failed query.
  const failed = e1 ?? e2 ?? e3 ?? e4;
  if (failed) throw new Error(failed.message);
  const parentIds = (pending ?? []).flatMap((p) => (p.parent_id ? [p.parent_id] : []));
  const { data: parents } = parentIds.length ? await supabase.from("community_posts").select("id, body").in("id", parentIds) : { data: [] };
  const parentBody = new Map((parents ?? []).map((q) => [q.id, q.body]));

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12">
      <header>
        <h1 className="text-4xl font-semibold">Community moderation</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Publish only first-hand, respectful posts without contact details, advertising or claims about other people.
          Reject anything you are unsure about; the author sees that it was not published.
        </p>
      </header>

      <section aria-labelledby="pending" className="grid gap-3">
        <h2 id="pending" className="text-2xl font-semibold">Waiting ({pending?.length ?? 0})</h2>
        {(pending ?? []).map((p) => {
          const flags = findContactDetails(p.pseudonym, p.title, p.body);
          return (
            <article key={p.id} aria-label={`Pending ${p.kind} by ${p.pseudonym}`} className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
              <p className="text-muted">
                <span className="font-semibold text-foreground">{label(p.kind)}</span> · {p.pseudonym}
                {p.programs?.title ? ` · ${p.programs.title}` : ""}{p.badge ? ` · ${p.badge}` : ""} · {shortDate(p.created_at)}
                {p.moderation_note ? ` · ${p.moderation_note}` : ""}
              </p>
              {p.parent_id && parentBody.get(p.parent_id) ? <p className="text-muted">In answer to: “{parentBody.get(p.parent_id)!.slice(0, 160)}”</p> : null}
              {p.title ? <p className="font-semibold">{p.title}</p> : null}
              <p className="whitespace-pre-line">{p.body}</p>
              {p.ratings ? <p className="text-muted">Ratings: {Object.entries(p.ratings as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(", ")}</p> : null}
              {flags.length ? <p role="alert" className="font-semibold text-conflicting">May contain {flags.map((f) => CONTACT_MESSAGES[f]).join(", ")}.</p> : null}
              <div className="flex flex-wrap items-end gap-2">
                <form action={moderatePost.bind(null, p.id, "published")}><button className="btn btn-primary btn-sm">Publish</button></form>
                <form action={moderatePost.bind(null, p.id, "rejected")} className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs">
                    Reason shown to the author
                    <input name="note" maxLength={500} className="field py-1 text-sm" style={{ width: "18rem" }} />
                  </label>
                  <button className="btn btn-secondary btn-sm">Reject</button>
                </form>
              </div>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="reports" className="grid gap-3">
        <h2 id="reports" className="text-2xl font-semibold">Reports ({reports?.length ?? 0})</h2>
        {(reports ?? []).map((r) => (
          <article key={r.id} aria-label={`Report: ${REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS]}`} className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
            <p className="font-semibold">{REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS]}{r.note ? `: ${r.note}` : ""}</p>
            <p className="text-muted">On a {label(r.community_posts?.kind ?? "post")} by {r.community_posts?.pseudonym} ({r.community_posts?.status}) · {shortDate(r.created_at)}</p>
            <p className="whitespace-pre-line">{r.community_posts?.title ? `${r.community_posts.title}: ` : ""}{r.community_posts?.body}</p>
            <div className="flex gap-2">
              <form action={resolveReport.bind(null, r.id, true)}><button className="btn btn-primary btn-sm">Remove the post</button></form>
              <form action={resolveReport.bind(null, r.id, false)}><button className="btn btn-secondary btn-sm">Dismiss</button></form>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="alumni" className="grid gap-3">
        <h2 id="alumni" className="text-2xl font-semibold">Alumni requests ({alumni?.length ?? 0})</h2>
        {(alumni ?? []).map((a) => (
          <article key={a.id} aria-label={`Alumni request for ${a.programs?.title}`} className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
            <p><span className="font-semibold">{a.programs?.title}</span>, class of {a.graduation_year} · {shortDate(a.created_at)}</p>
            <p className="text-muted">{a.evidence ?? "No evidence given."}</p>
            <div className="flex gap-2">
              <form action={reviewAlum.bind(null, a.id, true)}><button className="btn btn-primary btn-sm">Approve</button></form>
              <form action={reviewAlum.bind(null, a.id, false)}><button className="btn btn-secondary btn-sm">Reject</button></form>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="amas" className="grid gap-3">
        <h2 id="amas" className="text-2xl font-semibold">AMAs</h2>
        <p className="text-sm text-muted">Questions arrive in the queue above. Post the host&apos;s answers on each AMA&apos;s page.</p>
        <ul className="grid gap-2">
          {(amas ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <span>
                <Link href={`/community/ama/${a.id}`} className="font-semibold underline-offset-2 hover:underline">{a.title}</Link>
                <span className="text-muted"> · {a.host_name} · {amaWhen(a)} · {a.published ? (amaPhase(a) === "past" ? "past" : "published") : "draft"}</span>
              </span>
              <form action={setAmaPublished.bind(null, a.id, !a.published)}>
                <button className="btn btn-secondary btn-sm">{a.published ? "Unpublish" : "Publish"}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={createAma} aria-label="New AMA" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">New AMA</h3>
          <label className="grid gap-1">Title<input name="title" required minLength={3} maxLength={140} className="field" /></label>
          <label className="grid gap-1">Host&apos;s name<input name="host_name" required minLength={2} maxLength={80} className="field" /></label>
          <label className="grid gap-1">Host&apos;s role<input name="host_role" maxLength={140} placeholder="For example: International admissions, University of Exampleton" className="field" /></label>
          <label className="grid gap-1">Topic<input name="topic" maxLength={1000} className="field" /></label>
          <label className="grid gap-1">Starts (UTC)<input name="starts_at" type="datetime-local" required className="field" /></label>
          <label className="grid gap-1">Ends (UTC)<input name="ends_at" type="datetime-local" required className="field" /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="published" className="accent-[var(--accent)]" /> Publish now</label>
          <button className="btn btn-primary justify-self-start sm:col-span-2">Create AMA</button>
        </form>
      </section>
    </div>
  );
}
