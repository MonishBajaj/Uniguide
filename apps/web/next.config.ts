import type { NextConfig } from "next";

// Almost every page reads the Supabase session cookie, so Cache Components (which requires every
// request read to sit behind <Suspense>) is left off; pages render per request.
const nextConfig: NextConfig = {
  // Allow the dev client to hydrate when previewing from another device on the LAN.
  allowedDevOrigins: ["192.168.1.155"],
  transpilePackages: ["@uniguide/matching", "@uniguide/journey", "@uniguide/db-types", "@uniguide/portal-adapters"],
  // The blog reads its Markdown at request time for the sitemap.
  outputFileTracingIncludes: { "/sitemap.xml": ["./content/blog/**"], "/blog/**": ["./content/blog/**"], "/app/**": ["./content/help/**"] },
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
