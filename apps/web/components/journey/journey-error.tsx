/** Shown when the journey can't be read: the page stays up and offers a retry (journey M2). */
export function JourneyError({ title, body, retry, href }: { title: string; body: string; retry: string; href: string }) {
  return (
    <section role="alert" aria-labelledby="journey-error" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
      <h2 id="journey-error" className="text-lg font-semibold">{title}</h2>
      <p className="text-muted">{body}</p>
      <div>
        {/* A plain link reloads the page, so the journey is read again. */}
        <a href={href} className="btn btn-primary">{retry}</a>
      </div>
    </section>
  );
}
