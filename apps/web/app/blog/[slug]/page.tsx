import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, getPosts, readingMinutes, renderPost } from "@/lib/blog";
import { SITE_URL } from "@/lib/env";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.description, publishedTime: post.date },
  };
}

export default async function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    url: `${SITE_URL}/blog/${post.slug}`,
    publisher: { "@type": "Organization", name: "Uniguide" },
  };

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/blog" className="text-sm text-muted underline underline-offset-2">Blog</Link>
      <h1 className="mt-3 text-4xl font-semibold text-balance">{post.title}</h1>
      <p className="mt-3 text-sm text-muted">
        {new Date(`${post.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {readingMinutes(post)} min read
      </p>
      {/* Our own Markdown from content/blog, rendered at build time. */}
      <div className="post mt-10" dangerouslySetInnerHTML={{ __html: renderPost(post) }} />
    </article>
  );
}
