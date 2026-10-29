import { getPosts, rssFeed } from "@/lib/blog";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-static";

export function GET() {
  return new Response(rssFeed(getPosts(), SITE_URL), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
