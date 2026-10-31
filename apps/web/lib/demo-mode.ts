/**
 * Demo mode: sign-in and sign-up are switched off (AUTH_DISABLED=true) and the navbar switches between
 * Guest, User and Parent by signing in as a seeded local account. The login and signup code is kept;
 * set AUTH_DISABLED=false to use it again.
 */
export type Mode = "guest" | "user" | "parent";

export const MODES: readonly Mode[] = ["guest", "user", "parent"];

/** Seeded in supabase/seed.sql, which is for local development only. */
export const DEMO_ACCOUNTS = {
  user: { email: "student@uniguide.local", password: "password123", home: "/app" },
  parent: { email: "parent@uniguide.local", password: "password123", home: "/parent" },
} as const;

export const isMode = (value: unknown): value is Mode => MODES.includes(value as Mode);

export const isLocalUrl = (url: string): boolean => {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** The mode switcher signs in with fixed passwords, so it only runs against a local database. */
export const demoSwitcherEnabled = (authDisabled: boolean, supabaseUrl: string): boolean =>
  authDisabled && isLocalUrl(supabaseUrl);

export const modeOf = (signedIn: boolean, isParent: boolean): Mode => (!signedIn ? "guest" : isParent ? "parent" : "user");

/** Signed-in areas, the mode that opens each, and how to name it to a guest. Staff areas need real sign-in. */
const AREAS: { prefix: string; mode: Mode | null; name: string }[] = [
  { prefix: "/app/tracker", mode: "user", name: "your tracker" },
  { prefix: "/app/offers", mode: "user", name: "your offers" },
  { prefix: "/app/writing", mode: "user", name: "the writing coach" },
  { prefix: "/app/match", mode: "user", name: "your matches" },
  { prefix: "/app/shortlist", mode: "user", name: "your shortlist" },
  { prefix: "/app/profile", mode: "user", name: "your profile" },
  { prefix: "/app", mode: "user", name: "your account" },
  { prefix: "/parent", mode: "parent", name: "the parent view" },
  { prefix: "/admin", mode: null, name: "the reviewer pages" },
  { prefix: "/agency", mode: null, name: "the counselor pages" },
];

export type ModePrompt = { from: string; mode: Mode | null; name: string };

/** What a guest was trying to open, from the redirect's `from` parameter. Unknown or unsafe paths give null. */
export function modePrompt(from: unknown): ModePrompt | null {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return null;
  const area = AREAS.find((a) => from === a.prefix || from.startsWith(`${a.prefix}/`));
  return area ? { from, mode: area.mode, name: area.name } : null;
}

/** Where the proxy sends a guest who opened a signed-in page while sign-in is switched off. */
export const promptUrl = (path: string) => `/?from=${encodeURIComponent(path)}`;
