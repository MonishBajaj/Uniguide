import { moveItem, removeItem } from "@/app/app/portfolio/actions";
import { ShareButton } from "@/app/app/portfolio/share-button";
import { PORTFOLIO_BUCKET } from "@/lib/portfolio";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A student's portfolio. Files open through hour-long signed links; the owner can also edit. */
export async function PortfolioList({ supabase, userId, editable }: { supabase: Supabase; userId: string; editable: boolean }) {
  const { data: items } = await supabase.from("portfolio_items").select("*").eq("user_id", userId).order("sort").order("created_at");
  const paths = (items ?? []).flatMap((i) => (i.path ? [i.path] : []));
  const { data: signed } = paths.length ? await supabase.storage.from(PORTFOLIO_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  if (!(items ?? []).length) return <p className="text-muted">Nothing in the portfolio yet.</p>;

  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {items!.map((item, i) => {
        const href = item.url ?? (item.path ? urlFor.get(item.path) ?? undefined : undefined);
        return (
          <li key={item.id} aria-label={item.title} className="grid content-start gap-2 rounded-2xl border border-border bg-surface p-4 text-sm">
            {item.mime?.startsWith("image/") && href ? (
              // Signed, short-lived URLs from private storage; next/image would cache them.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={href} alt={item.title} loading="lazy" className="aspect-video w-full rounded-lg border border-border bg-background object-cover" />
            ) : null}
            <a href={href} target="_blank" rel="noreferrer" className="text-base font-semibold underline-offset-2 hover:underline">{item.title}</a>
            <p className="text-xs text-muted">{item.kind === "link" ? new URL(item.url!).hostname : item.mime === "application/pdf" ? "PDF" : "Image"}</p>
            {item.description ? <p className="text-muted">{item.description}</p> : null}
            {editable ? (
              <div className="flex flex-wrap items-end gap-2">
                <form action={moveItem.bind(null, item.id, "up")}><button disabled={i === 0} aria-label={`Move ${item.title} up`} className="btn btn-secondary btn-sm">↑</button></form>
                <form action={moveItem.bind(null, item.id, "down")}><button disabled={i === items!.length - 1} aria-label={`Move ${item.title} down`} className="btn btn-secondary btn-sm">↓</button></form>
                <ShareButton id={item.id} title={item.title} />
                <form action={removeItem.bind(null, item.id)}><button aria-label={`Remove ${item.title}`} className="btn btn-secondary btn-sm">Remove</button></form>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
