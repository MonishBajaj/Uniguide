import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { FAIL_COOKIE, failureInjected, journeyRequest, type LoadedJourney } from "./journey-request";
import { utcToday } from "./journey-snapshot";

/** One journey per request, shared by the navigation and the page (React `cache()` is per request). */
const forRequest = cache(async () => {
  const [supabase, jar] = await Promise.all([createClient(), cookies()]);
  return journeyRequest(supabase, utcToday(), failureInjected({ E2E: process.env.E2E }, jar.get(FAIL_COOKIE)?.value));
});

/** The signed-in student's journey. Throws when it can't be read; callers show an error state. */
export async function getJourney(): Promise<LoadedJourney> {
  return (await forRequest()).get();
}

/** Stores the journey this request computed. Only pages save; the navigation never does. */
export async function saveJourney(): Promise<void> {
  return (await forRequest()).save();
}
