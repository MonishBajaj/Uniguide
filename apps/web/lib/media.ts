/**
 * 17.3 and 17.4: videos, podcasts and webinars. Only YouTube and Spotify links are embedded (YouTube
 * through its no-cookie domain); anything else is a plain link out.
 */
export interface MediaItem {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  starts_at: string | null;
}

export function embedUrl(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const youtube = host === "youtu.be" ? u.pathname.slice(1) : host === "youtube.com" ? (u.pathname === "/watch" ? u.searchParams.get("v") : u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]) : null;
  if (youtube && /^[\w-]{11}$/.test(youtube)) return `https://www.youtube-nocookie.com/embed/${youtube}`;
  const spotify = host === "open.spotify.com" ? u.pathname.match(/^\/(episode|show)\/([A-Za-z0-9]+)$/) : null;
  if (spotify) return `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`;
  return null;
}

/** Webinars still to come, soonest first; and everything watchable or listenable now, newest first. */
export function splitMedia<T extends MediaItem & { published_at: string | null }>(items: T[], now = new Date()) {
  const upcoming = items
    .filter((i) => i.kind === "webinar" && i.starts_at && Date.parse(i.starts_at) > now.getTime())
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  const recordings = items
    .filter((i) => i.url && !upcoming.includes(i))
    .sort((a, b) => (b.starts_at ?? b.published_at ?? "").localeCompare(a.starts_at ?? a.published_at ?? ""));
  return { upcoming, recordings };
}
