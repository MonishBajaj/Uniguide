import type { Metadata } from "next";
import Link from "next/link";
import { getPosts, readingMinutes } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description: "How Uniguide checks the deadlines, fees and requirements students apply with.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
};

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function BlogIndex() {
  const posts = getPosts();
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Blog</h1>
        <p className="text-muted">
          How Uniguide checks the facts students apply with, and what we learn doing it.{" "}
          <a href="/blog/rss.xml" className="underline underline-offset-2">RSS feed</a>
        </p>
      </header>
      <ul className="grid gap-6">
        {posts.map((p) => (
          <li key={p.slug} className="grid gap-1 border-t border-border pt-6">
            <p className="text-sm text-muted">{longDate(p.date)} · {readingMinutes(p)} min read</p>
            <h2 className="text-2xl font-semibold"><Link href={`/blog/${p.slug}`} className="underline-offset-4 hover:underline">{p.title}</Link></h2>
            <p className="text-muted">{p.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
