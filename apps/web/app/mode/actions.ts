"use server";

import { redirect } from "next/navigation";
import { DEMO_ACCOUNTS, isMode } from "@/lib/demo-mode";
import { DEMO_SWITCHER } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Guest signs out; User and Parent sign in as the seeded local accounts. Only while sign-in is switched off. */
export async function switchMode(mode: string): Promise<string | void> {
  if (!DEMO_SWITCHER || !isMode(mode)) redirect("/");
  const supabase = await createClient();
  if (mode === "guest") {
    await supabase.auth.signOut();
    redirect("/");
  }
  const { email, password, home } = DEMO_ACCOUNTS[mode];
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // A missing account means the local seed has not been loaded; say so rather than pretend.
  if (error) return `Could not sign in as the ${mode} demo account. Is the local seed loaded?`;
  redirect(home);
}
