import type { Metadata } from "next";
import { amaWhen } from "@/lib/ama";
import { shortDate } from "@/lib/format";
import { embedUrl, splitMedia } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Webinars, videos and podcasts",
  description: "Free webinars and recordings on applying abroad: requirements, essays, offers and visas.",
  alternates: { canonical: "/learn" },
};

const KIND = { video: "Video", podcast: "Podcast", webinar: "Webinar recording" } as const;

export default async function Learn() {
  const supabase = await createClient();
  const { data } = await supabase.from("media_items").select("*").eq("published", true);
  const { upcoming, recordings } = splitMedia(data ?? []);

  return (
    <div className="mx-auto grid max-w-3xl gap-12 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Webinars, videos and podcasts</h1>
        <p className="text-muted">Free sessions on applying abroad. Facts about a course are always on its own page, from its official sources.</p>
      </header>

      <section aria-labelledby="webinars" className="grid gap-3">
        <h2 id="webinars" className="text-2xl font-semibold">Coming up</h2>
        {upcoming.length ? (
          <ul className="grid gap-3">
            {upcoming.map((w) => (
              <li key={w.id} aria-label={w.title} className="grid gap-2 rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-lg font-semibold">{w.title}</h3>
                <p className="text-sm text-muted">{amaWhen({ starts_at: w.starts_at!, ends_at: w.starts_at! }).replace(/ to .*$/, " UTC")}</p>
                {w.description ? <p className="text-sm">{w.description}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {w.registration_url ? <a href={w.registration_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Register</a> : null}
                  <a href={`/learn/${w.id}/event.ics`} className="btn btn-secondary btn-sm">Add to calendar (.ics)</a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No webinars scheduled yet.</p>
        )}
      </section>

      <section aria-labelledby="recordings" className="grid gap-3">
        <h2 id="recordings" className="text-2xl font-semibold">Watch and listen</h2>
        {recordings.length ? (
          <ul className="grid gap-6">
            {recordings.map((r) => {
              const embed = embedUrl(r.url);
              return (
                <li key={r.id} aria-label={r.title} className="grid gap-2">
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{KIND[r.kind as keyof typeof KIND]} · {shortDate(r.starts_at ?? r.published_at)}</p>
                  <h3 className="text-lg font-semibold">{r.title}</h3>
                  {r.description ? <p className="text-sm text-muted">{r.description}</p> : null}
                  {embed ? (
                    <iframe
                      src={embed}
                      title={r.title}
                      loading="lazy"
                      allow="encrypted-media; picture-in-picture"
                      className={`w-full rounded-xl border border-border ${r.kind === "podcast" ? "h-40" : "aspect-video"}`}
                    />
                  ) : null}
                  <a href={r.url!} target="_blank" rel="noreferrer" className="justify-self-start text-sm underline underline-offset-2">
                    {embed ? "Open on its own site" : r.kind === "podcast" ? "Listen" : "Watch"}
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted">No recordings yet.</p>
        )}
      </section>
    </div>
  );
}
