import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import type { Locale } from "@/lib/i18n";

/**
 * Journey M4 (J4.1): help for the page a student is on, from content/help/<locale>/<key>.md. Our own
 * content, so the HTML is trusted. Hindi falls back to English for a page without a Hindi file.
 */

/** Every /app route with its own help. Deeper pages use the nearest route above them. */
export const HELP_ROUTES = [
  "/app",
  "/app/steps",
  "/app/onboarding",
  "/app/match",
  "/app/match/what-if",
  "/app/matching",
  "/app/shortlist",
  "/app/tracker",
  "/app/tracker/[id]",
  "/app/tracker/costs",
  "/app/writing",
  "/app/recommenders",
  "/app/cv",
  "/app/portfolio",
  "/app/offers",
  "/app/departure",
  "/app/profile",
  "/app/sharing",
  "/app/notifications",
  "/app/next-intake",
] as const;

export type HelpRoute = (typeof HELP_ROUTES)[number];

/** The file name for a route: "/app" is "home", "/app/tracker/[id]" is "tracker-id". */
export const helpKey = (route: HelpRoute) => (route === "/app" ? "home" : route.slice(5).replace(/\//g, "-").replace(/\[|\]/g, ""));

const matches = (route: string, parts: string[]) => {
  const want = route.split("/");
  return want.length === parts.length && want.every((w, i) => (w.startsWith("[") ? Boolean(parts[i]) : w === parts[i]));
};

/** The help route for a request path, or null outside /app. */
export function helpRoute(pathname: string | null | undefined): HelpRoute | null {
  if (!pathname || !(pathname === "/app" || pathname.startsWith("/app/"))) return null;
  let parts = pathname.replace(/\/+$/, "").split("/");
  while (parts.length > 1) {
    // An exact route ("/app/tracker/costs") wins over a pattern ("/app/tracker/[id]").
    const found = HELP_ROUTES.find((r) => r === parts.join("/")) ?? HELP_ROUTES.find((r) => matches(r, parts));
    if (found) return found;
    parts = parts.slice(0, -1);
  }
  return null;
}

// Not traced from here; next.config.ts ships content/help with the pages.
const DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "help");

/** The page's help as HTML, in the student's language when it exists. */
export function helpFor(pathname: string | null | undefined, locale: Locale): string | null {
  const route = helpRoute(pathname);
  if (!route) return null;
  for (const lang of locale === "en" ? ["en"] : [locale, "en"]) {
    const file = path.join(DIR, lang, `${helpKey(route)}.md`);
    if (existsSync(file)) return marked.parse(readFileSync(file, "utf8"), { async: false });
  }
  return null;
}
