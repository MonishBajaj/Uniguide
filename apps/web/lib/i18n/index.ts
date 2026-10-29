import { en, type Dict } from "./en";
import { hi } from "./hi";

/** 15.4 Interface languages. Facts are never translated; only the words around them. */
export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "ug_locale";

const DICTS: Record<Locale, Dict> = { en, hi };
export const dict = (locale: Locale): Dict => DICTS[locale];

/** A saved choice wins; otherwise Hindi only when the browser puts it before English. */
export function pickLocale(cookie: string | undefined | null, acceptLanguage: string | null): Locale {
  if (cookie === "en" || cookie === "hi") return cookie;
  const first = acceptLanguage
    ?.split(",")
    .map((part) => part.split(";")[0]!.trim().toLowerCase())
    .find((tag) => tag.startsWith("en") || tag.startsWith("hi"));
  return first?.startsWith("hi") ? "hi" : "en";
}
