import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { z } from "zod";

/** 17.2 Blog: Markdown files in content/blog with a small frontmatter block. Our own content, so the HTML is trusted. */
export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  body: string;
}

const Frontmatter = z.object({
  title: z.string().min(1).max(160),
  date: z.iso.date(),
  description: z.string().min(1).max(300),
});

// Not traced from here (that would pull in the whole project); next.config.ts ships content/blog instead.
const DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "blog");

/** Splits `---` frontmatter (key: value lines, values optionally quoted) from the Markdown body. */
export function parsePost(slug: string, raw: string): Post {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match) throw new Error(`${slug}: missing frontmatter`);
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]!] = kv[2]!.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
  }
  const meta = Frontmatter.safeParse(fields);
  if (!meta.success) throw new Error(`${slug}: ${meta.error.issues.map((i) => i.path.join(".")).join(", ")} invalid`);
  return { slug, ...meta.data, body: raw.slice(match[0].length).trim() };
}

/** All posts, newest first. Slugs are file names, so they are unique. */
export function getPosts(): Post[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parsePost(f.slice(0, -3), readFileSync(path.join(DIR, f), "utf8")))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function getPost(slug: string): Post | null {
  return getPosts().find((p) => p.slug === slug) ?? null;
}

export function renderPost(post: Post): string {
  return marked.parse(post.body, { async: false, gfm: true });
}

export function readingMinutes(post: Post): number {
  return Math.max(1, Math.round(post.body.split(/\s+/).length / 220));
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rssFeed(posts: Post[], site: string): string {
  const items = posts
    .map((p) =>
      [
        "<item>",
        `<title>${xml(p.title)}</title>`,
        `<link>${site}/blog/${p.slug}</link>`,
        `<guid>${site}/blog/${p.slug}</guid>`,
        `<pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `<description>${xml(p.description)}</description>`,
        "</item>",
      ].join(""),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Uniguide blog</title>
<link>${site}/blog</link>
<description>How Uniguide checks the facts students apply with.</description>
${items}
</channel></rss>
`;
}
