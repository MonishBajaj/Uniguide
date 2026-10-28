import type { FullConfig } from "@playwright/test";

/** Stop the whole run, with a clear reason, when the server has sign-in switched off (demo mode). */
export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL;
  const res = await fetch(`${base}/login`, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new Error("Sign-in is switched off: the server on this port has AUTH_DISABLED=true. Stop it and rerun, or set AUTH_DISABLED=false.");
  }
}
