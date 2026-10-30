import type { NextConfig } from "next";

// Almost every page reads the Supabase session cookie, so Cache Components (which requires every
// request read to sit behind <Suspense>) is left off; pages render per request.
const nextConfig: NextConfig = {
  transpilePackages: ["@uniguide/matching", "@uniguide/journey", "@uniguide/db-types"],
  // The blog reads its Markdown at request time for the sitemap.
  outputFileTracingIncludes: { "/sitemap.xml": ["./content/blog/**"], "/blog/**": ["./content/blog/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
