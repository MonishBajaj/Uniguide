import { demoSwitcherEnabled } from "@/lib/demo-mode";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Copy .env.example to apps/web/.env.local.`);
  return value;
}

// NEXT_PUBLIC_* values must be referenced literally so Next can inline them in client bundles.
export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
/** Sign-in and sign-up are switched off while this is true; the code stays. See lib/demo-mode.ts. */
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
export const DEMO_SWITCHER = demoSwitcherEnabled(AUTH_DISABLED, SUPABASE_URL);
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Part 3 community features (stories, reviews, alumni, AMAs). Off until legal review; see BACKLOG.md. */
export const COMMUNITY_ENABLED = process.env.COMMUNITY_ENABLED === "true";

/** Bumped whenever the terms or privacy policy change; stored on every consent row. */
export const POLICY_VERSION = "2026-10-draft";
