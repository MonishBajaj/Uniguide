import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { addMedia, deleteMedia, setMediaPublished } from "./actions";

export const metadata: Metadata = { title: "Media" };

export default async function MediaAdmin() {
  const { supabase, user } = await getUser();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!admin) notFound();
  const { data: items } = await supabase.from("media_items").select("*").order("created_at", { ascending: false });

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12">
      <header>
        <h1 className="text-4xl font-semibold">Webinars, videos and podcasts</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Published items appear on <Link href="/learn" className="underline underline-offset-2">/learn</Link>. YouTube and
          Spotify links are embedded; anything else is linked. Add only real sessions and recordings.
        </p>
      </header>

      <ul className="grid gap-2">
        {(items ?? []).map((m) => (
          <li key={m.id} aria-label={m.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <span>
              <span className="font-semibold">{m.title}</span>
              <span className="text-muted"> · {m.kind}{m.starts_at ? ` · ${shortDate(m.starts_at)}` : ""} · {m.published ? "published" : "draft"}</span>
            </span>
            <span className="flex gap-2">
              <form action={setMediaPublished.bind(null, m.id, !m.published)}><button className="btn btn-secondary btn-sm">{m.published ? "Unpublish" : "Publish"}</button></form>
              <form action={deleteMedia.bind(null, m.id)}><button className="btn btn-secondary btn-sm">Delete</button></form>
            </span>
          </li>
        ))}
      </ul>

      <form action={addMedia} aria-label="Add media" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm sm:grid-cols-2">
        <h2 className="text-lg font-semibold sm:col-span-2">Add</h2>
        <label className="grid gap-1">
          Kind
          <select name="kind" className="field">
            <option value="webinar">Webinar</option>
            <option value="video">Video</option>
            <option value="podcast">Podcast</option>
          </select>
        </label>
        <label className="grid gap-1">Title<input name="title" required minLength={3} maxLength={140} className="field" /></label>
        <label className="grid gap-1 sm:col-span-2">Description<input name="description" maxLength={1000} className="field" /></label>
        <label className="grid gap-1">Recording or page link (https)<input name="url" type="url" className="field" /></label>
        <label className="grid gap-1">Webinar starts (UTC)<input name="starts_at" type="datetime-local" className="field" /></label>
        <label className="grid gap-1 sm:col-span-2">Registration link (https)<input name="registration_url" type="url" className="field" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="published" className="accent-[var(--accent)]" /> Publish now</label>
        <button className="btn btn-primary justify-self-start sm:col-span-2">Add</button>
      </form>
    </div>
  );
}
