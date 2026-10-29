import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Course and course-intake pages that have collected facts (Listed-only courses are thin pages). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("slug, updated_at, program_cycles(label, intake_term)")
    .in("coverage_tier", ["extracted", "verified"])
    .limit(45_000);
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: "daily" },
    { url: `${SITE_URL}/requirements`, changeFrequency: "daily" },
    { url: `${SITE_URL}/compare/countries`, changeFrequency: "weekly" },
    { url: `${SITE_URL}/insights`, changeFrequency: "weekly" },
    { url: `${SITE_URL}/deadlines`, changeFrequency: "daily" },
    { url: `${SITE_URL}/english-tests`, changeFrequency: "weekly" },
    { url: `${SITE_URL}/visas`, changeFrequency: "monthly" },
    { url: `${SITE_URL}/guide`, changeFrequency: "monthly" },
    { url: `${SITE_URL}/learn`, changeFrequency: "weekly" },
    { url: `${SITE_URL}/accessibility`, changeFrequency: "yearly" },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly" },
    ...getPosts().map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.date, changeFrequency: "yearly" as const })),
  ];
  for (const p of data ?? []) {
    pages.push({ url: `${SITE_URL}/courses/${p.slug}`, lastModified: p.updated_at, changeFrequency: "weekly" });
    for (const c of p.program_cycles.filter((c) => c.intake_term !== "any")) {
      pages.push({ url: `${SITE_URL}/courses/${p.slug}/${c.label}`, lastModified: p.updated_at, changeFrequency: "weekly" });
    }
  }
  return pages;
}
