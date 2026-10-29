"use client";

import { createContext, useContext } from "react";
import { dict, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The interface text for the current language, in client components. */
export const useT = () => dict(useContext(LocaleContext));
