import "server-only";
import { cookies, headers } from "next/headers";
import { dict, LOCALE_COOKIE, pickLocale } from "./index";

export async function getLocale() {
  const [jar, head] = await Promise.all([cookies(), headers()]);
  const locale = pickLocale(jar.get(LOCALE_COOKIE)?.value, head.get("accept-language"));
  return { locale, t: dict(locale) };
}
