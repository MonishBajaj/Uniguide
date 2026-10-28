/**
 * Demo mode: sign-in and sign-up are switched off (AUTH_DISABLED=true) and the navbar switches between
 * Guest, User and Parent by signing in as a seeded local account. The login and signup code is kept;
 * set AUTH_DISABLED=false to use it again.
 */
export type Mode = "guest" | "user" | "parent";

export const MODES: readonly Mode[] = ["guest", "user", "parent"];

/** Seeded in supabase/seed.sql, which is for local development only. */
export const DEMO_ACCOUNTS = {
  user: { email: "student@uniguide.local", password: "password123", home: "/app/profile" },
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
